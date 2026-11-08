#!/usr/bin/env node
// Builds an explainer work dir into one offline HTML file, then renders
// contact sheets of every animation in headless Chromium so the author can
// look at the frames without a browser.
//
//   node build.mjs setup                                              # install the engine and a browser (run it in the background early)
//   node build.mjs build <workdir> [--out page.html] [--lang pt-BR] [--cover-depth 2] [--replace] [--no-verify]
//   node build.mjs build <workdir> --only <id>[,<id>...] [--lang pt-BR]  # just those animations → <workdir>/.preview/<ids>.html
//   node build.mjs frames <page.html> <id> <seconds> [<seconds>...]   # full-size stills → <tmpdir>/animate-stills/<page>/
//   node build.mjs extract <page.html> <workdir>                      # restore sources
//
// The first build (or setup) installs the engine's dependencies (npm ci). The browser is
// Playwright's own when installed, else Google Chrome or Microsoft Edge when installed, else
// Playwright's headless shell, downloaded once. ANIMATE_BROWSER=<channel or executable path>
// picks one explicitly (any Chromium-based browser: chrome, msedge, a Brave or Arc binary).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile, execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ENGINE = path.dirname(fileURLToPath(import.meta.url));
// A scene whose timing never finishes (an endless loop) would otherwise hang the build.
const READY_MS = 30000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SOURCE_ID = 'animate-source';
// Files embedded as text; anything else under animations/ (images) is embedded as base64.
const TEXT_FILE = /\.(md|ts|tsx|css|json|svg)$/;
// Sets <html data-theme> before the first paint (engine/theme.ts takes over once the bundle runs).
const THEME_HEAD = `<script>{let t;try{t=localStorage.getItem('animate-theme')}catch{}document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}</script>`;

function die(msg) {
  console.error(`error ${msg}`);
  process.exit(1);
}

// Installs are serialized across processes (a background `setup` and a build, or parallel
// --only builds), so two npm ci runs never write node_modules at once.
async function withLock(name, fn) {
  const dir = path.join(ENGINE, `.lock-${name}`);
  let told = false;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'pid'), String(process.pid));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0, age = 0;
      try { pid = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8')); } catch {}
      try { age = Date.now() - fs.statSync(dir).mtimeMs; } catch {}
      let alive = !pid && age < 60000; // just created: the pid file is on its way
      if (pid) try { process.kill(pid, 0); alive = true; } catch (err) { alive = err.code === 'EPERM'; }
      if (!alive) { fs.rmSync(dir, {recursive: true, force: true}); continue; }
      if (!told) console.log(`Waiting for another process to finish installing (${name})...`);
      told = true;
      await sleep(1000);
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// First run: install the engine's dependencies.
async function ensureEngine() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 19)) die(`Node 20.19 or newer is required (found ${process.versions.node})`);
  const tsc = path.join(ENGINE, 'node_modules', '.bin', 'tsc');
  if (fs.existsSync(tsc) && !fs.existsSync(path.join(ENGINE, '.lock-engine'))) return;
  await withLock('engine', () => {
    if (fs.existsSync(tsc)) return;
    console.log('First run: installing the engine (npm ci in engine/, about 150 MB)...');
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], {cwd: ENGINE, stdio: 'inherit', shell: process.platform === 'win32'});
  });
}

// Any Chromium-based browser renders the deck the same way, so reuse one that is already
// on disk before downloading Playwright's headless shell (about 200 MB on disk, once; full
// Chromium would add about 370 MB more).
async function launchBrowser() {
  const {chromium} = await import('playwright');
  const want = process.env.ANIMATE_BROWSER;
  if (want) return chromium.launch(fs.existsSync(want) ? {executablePath: want} : {channel: want});
  const missing = e => /Executable doesn't exist|playwright install|is not found|not installed/i.test(String(e));
  let first;
  for (const opts of [{}, {channel: 'chrome'}, {channel: 'msedge'}]) {
    try {
      return await chromium.launch(opts);
    } catch (e) {
      first ??= e;
    }
  }
  if (!missing(first)) throw first;
  await withLock('browser', async () => {
    try {
      await (await chromium.launch()).close();
    } catch {
      console.log('First run: no Chromium-based browser found; downloading Playwright\'s headless Chromium...');
      execFileSync(process.execPath, [path.join(ENGINE, 'node_modules/playwright/cli.js'), 'install', '--only-shell', 'chromium'], {stdio: 'inherit'});
    }
  });
  return chromium.launch();
}

async function setup() {
  await ensureEngine();
  const browser = await launchBrowser();
  console.log(`Ready: engine installed, browser ${browser.browserType().name()} ${browser.version()}.`);
  await browser.close();
}

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) pos.push(a);
    else if (['--replace', '--no-verify'].includes(a)) opt[a.slice(2)] = true;
    else opt[a.slice(2)] = argv[++i];
  }
  return {pos, opt};
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else if (/\.(md|ts|tsx|css|json|svg|png|jpe?g|webp|gif)$/.test(e.name) && e.name !== 'tsconfig.json')
      out.push(path.relative(base, p));
  }
  return out;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
}

// Inline <script> content must not contain a closing script tag.
const scriptSafe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

// Several builds may share a work dir at once (parallel --only builds), so shared files are
// written only when their content changes and per-build files carry the build's tag.
function writeIfChanged(file, content) {
  try {
    if (fs.readFileSync(file, 'utf8') === content) return;
  } catch {}
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

// Returns the tsconfig to check: the whole deck, or only the files the given animations use.
function prepareWorkdir(work, tag, only) {
  const nm = path.join(work, 'node_modules');
  try {
    fs.symlinkSync(path.join(ENGINE, 'node_modules'), nm, 'dir');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const tsconfig = include => JSON.stringify({
    extends: '@canvas-commons/2d/tsconfig.project.json',
    compilerOptions: {skipLibCheck: true},
    include,
  }, null, 2);
  writeIfChanged(path.join(work, 'tsconfig.json'), tsconfig(['animations', '.types.d.ts']));
  writeIfChanged(path.join(work, '.types.d.ts'), '/// <reference types="@canvas-commons/core/project" />\n');
  if (!only) return path.join(work, 'tsconfig.json');
  // tsc follows imports, so animations/lib comes along when a scene uses it.
  const file = path.join(work, `.tsconfig-${tag}.json`);
  writeIfChanged(file, tsconfig([...only.flatMap(id => [`animations/${id}.ts`, `animations/${id}`]), '.types.d.ts']));
  return file;
}

// What an animation's contact sheet depends on: every file under animations/ except other
// animations' own files, plus the engine and the language. Unchanged → the old sheet stands.
function animationHash(work, id, ids, lang) {
  const h = crypto.createHash('sha256').update(`${lang}\0`);
  const others = ids.filter(o => o !== id);
  const animDir = path.join(work, 'animations');
  for (const f of walk(animDir).sort()) {
    const first = f.split(path.sep)[0];
    if (others.some(o => first === `${o}.ts` || first === o)) continue;
    h.update(`${f}\0`).update(fs.readFileSync(path.join(animDir, f)));
  }
  for (const f of ['core.ts', 'deck.ts', 'theme.ts', 'kit/index.tsx', 'package-lock.json'])
    h.update(fs.readFileSync(path.join(ENGINE, f)));
  return h.digest('hex');
}

function animationIds(md) {
  return [...md.matchAll(/data-animation="([^"]+)"/g)].map(m => m[1]);
}

// Deck: the intro (before the first ##) becomes a title card; each ## section
// becomes its animations in order, or a text card when it has none. Each
// section's prose (figures removed) goes to the notes panel. With `only`, the deck holds just
// those animations and their sections (a preview for one animation's author).
function deckBody(marked, md, only) {
  const lexed = marked.lexer(md);
  const parse = toks => marked.parser(Object.assign(toks, {links: lexed.links}));
  const sections = [{title: '', toks: []}];
  for (const tok of lexed) {
    if (tok.type === 'heading' && tok.depth === 2) sections.push({title: tok.text, toks: [tok]});
    else sections[sections.length - 1].toks.push(tok);
  }
  const entities = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"};
  const plain = s => marked.parseInline(s).replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, m => entities[m]).trim();
  const title = plain(lexed.find(t => t.type === 'heading' && t.depth === 1)?.text ?? '');
  const stage = [], notes = [];
  sections.forEach((s, i) => {
    const sid = `s${i}`;
    const figs = s.toks.filter(t => t.type === 'html' && /data-animation=/.test(t.raw));
    if (only && !figs.some(f => animationIds(f.raw).some(id => only.includes(id)))) return;
    const prose = parse(s.toks.filter(t => !figs.includes(t)));
    const name = i === 0 ? title : plain(s.title);
    if (i === 0 && s.toks.length === 0) return;
    if (figs.length === 0) {
      stage.push(`<section class="deck-card${i === 0 ? ' deck-intro' : ''}" data-section="${sid}"><div class="deck-card-body">${prose}</div></section>`);
      notes.push(`<div class="deck-note" data-section="${sid}" data-title="${escapeHtml(name)}"></div>`);
      return;
    }
    for (const f of figs)
      for (const m of f.raw.matchAll(/<figure[^>]*data-animation="([^"]+)"[^>]*>([\s\S]*?)<\/figure>/g)) {
        if (only && !only.includes(m[1])) continue;
        const cap = plain(m[2].match(/<figcaption>([\s\S]*?)<\/figcaption>/)?.[1] ?? '');
        stage.push(`<figure class="deck-anim" data-animation="${m[1]}" data-section="${sid}" data-caption="${escapeHtml(cap)}"></figure>`);
      }
    notes.push(`<div class="deck-note" data-section="${sid}" data-title="${escapeHtml(name)}">${prose}</div>`);
  });
  return `<div class="deck">
<div class="deck-main">
<header class="deck-head"><span class="deck-title">${escapeHtml(title)}</span><span class="deck-sec"></span></header>
<div class="deck-stage">
${stage.join('\n')}
</div>
<footer class="deck-bar">
<button type="button" class="deck-prev" aria-label="Previous step">‹</button>
<div class="deck-progress"></div>
<span class="deck-count"></span>
<button type="button" class="deck-next" aria-label="Next step">›</button>
<span class="deck-hint">← → · scroll · i · n · t · f · g</span>
<button type="button" class="deck-gif" aria-label="Download this animation as a GIF (g)" title="Download this animation as a GIF (g)">GIF</button>
<button type="button" class="deck-theme" aria-label="Light or dark theme (t)">◐</button>
<button type="button" class="deck-notes-toggle" aria-label="Toggle notes (n)">☰</button>
<button type="button" class="deck-full" aria-label="Fullscreen (f)">⛶</button>
</footer>
</div>
<aside class="deck-notes">
${notes.join('\n')}
</aside>
</div>`;
}

async function build(work, opt) {
  work = path.resolve(work);
  const mdPath = path.join(work, 'page.md');
  if (!fs.existsSync(mdPath)) die(`${mdPath} not found`);
  const md = fs.readFileSync(mdPath, 'utf8');
  const ids = animationIds(md);
  if (ids.length === 0) die('page.md has no <figure class="anim" data-animation="<id>"> element');
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) die(`animation ids used twice in page.md: ${dupes.join(', ')}`);
  // --only: build just these animations (a preview for whoever writes them, possibly
  // while other animations in the same work dir are half written).
  const only = opt.only ? String(opt.only).split(',').map(s => s.trim()).filter(Boolean) : null;
  if (only) {
    const unknown = only.filter(id => !ids.includes(id));
    if (unknown.length) die(`--only names animations page.md doesn't show: ${unknown.join(', ')}`);
    if (opt.out) die('--only writes its preview to <workdir>/.preview/; drop --out');
  }
  const built = only ?? ids;
  const tag = only ? `only-${built.join('_').replace(/[^\w-]+/g, '-')}` : 'deck';
  const out = only
    ? path.join(work, '.preview', `${built.join('_').replace(/[^\w-]+/g, '-')}.html`)
    : path.resolve(opt.out ?? path.join(os.tmpdir(), 'animated-explainer', `${path.basename(work)}.html`));
  if (!only && fs.existsSync(out) && !opt.replace) die(`${out} exists; pass --replace to overwrite`);

  // Every check below adds to `problems` instead of stopping, so one build reports them all.
  const problems = [];
  const animDir = path.join(work, 'animations');
  for (const id of built)
    if (!fs.existsSync(path.join(animDir, `${id}.ts`)))
      problems.push(`page.md shows "${id}" but animations/${id}.ts (its makeProject file) is missing`);
  const unused = !only && fs.existsSync(animDir)
    ? fs.readdirSync(animDir).filter(f => f.endsWith('.ts') && !ids.includes(f.slice(0, -3)))
    : [];
  if (unused.length) console.warn(`warning project files not shown in page.md: ${unused.join(', ')}`);

  // Source passages: ids passed to the kit's source() must exist as <mark data-src> in page.md.
  // With --only, only the built animations' own files and animations/lib count.
  const marks = new Set([...md.matchAll(/<(?:mark|div)[^>]*data-src="([^"]+)"/g)].map(m => m[1]));
  const used = new Set();
  const others = ids.filter(id => !built.includes(id));
  for (const f of fs.existsSync(animDir) ? walk(animDir) : []) {
    if (!/\.tsx?$/.test(f)) continue;
    const first = f.split(path.sep)[0];
    if (others.some(o => first === `${o}.ts` || first === o)) continue;
    const src = fs.readFileSync(path.join(animDir, f), 'utf8');
    for (const call of src.matchAll(/\bsource\(([^)]*)\)/g))
      for (const s of call[1].matchAll(/['"`]([^'"`]+)['"`]/g)) used.add(s[1]);
  }
  const missing = [...used].filter(id => !marks.has(id));
  if (missing.length) problems.push(`source() ids with no <mark data-src="..."> or <div data-src="..."> in page.md: ${missing.join(', ')}`);
  const unmarked = [...marks].filter(id => !used.has(id));
  if (unmarked.length && !only) console.warn(`warning marked passages no step points to: ${unmarked.join(', ')}`);

  // Coverage: when the work dir holds the source (source.md), every heading down
  // to --cover-depth (default 2) must be named in some <p class="src-ref"> or
  // skipped with <!-- skip: <heading> — <reason> -->. Deck sections should
  // follow the source's order. A whole-deck check, so --only skips it.
  const srcFile = path.join(work, 'source.md');
  if (!only && fs.existsSync(srcFile)) {
    const depth = Number(opt['cover-depth'] ?? 2);
    const norm = s => s.replace(/<[^>]+>/g, '').replace(/[`*_\\]/g, '').replace(/^\s*(?:\d+(?:\.\d+)*\.?|[A-Z]\d*[:.])\s+/, '')
      .replace(/[:.]\s*$/, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const lines = fs.readFileSync(srcFile, 'utf8').split('\n');
    let inFence = false, titleSeen = false;
    const heads = [];
    for (const l of lines) {
      if (/^\s*```/.test(l)) inFence = !inFence;
      const m = !inFence && l.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (!m || m[1].length > depth) continue;
      if (m[1].length === 1 && !titleSeen) { titleSeen = true; continue; } // the doc's title
      if (norm(m[2])) heads.push(norm(m[2]));
    }
    const refs = [...md.matchAll(/<p class="src-ref"[^>]*>([\s\S]*?)<\/p>/g)].map(m => norm(m[1]));
    const skips = [...md.matchAll(/<!--\s*skip:\s*([\s\S]*?)-->/g)].map(m => norm(m[1]));
    const seen = new Set();
    const uniq = heads.filter(h => !seen.has(h) && seen.add(h));
    const uncovered = uniq.filter(h => !refs.some(r => r.includes(h)) && !skips.some(s => s.startsWith(h)));
    console.log(`coverage ${uniq.length - uncovered.length}/${uniq.length} source sections (depth ${depth})`);
    if (uncovered.length)
      problems.push(`source sections not covered by any <p class="src-ref"> nor skipped:\n  ${uncovered.join('\n  ')}\nName each in the src-ref of the deck section that quotes it, or add <!-- skip: <heading> — <reason> -->.`);
    // Order: each deck section's first covered heading should not come before the previous one's.
    let last = -1;
    const back = [];
    for (const [i, sec] of md.split(/^## /m).slice(1).entries()) {
      const r = [...sec.matchAll(/<p class="src-ref"[^>]*>([\s\S]*?)<\/p>/g)].map(m => norm(m[1])).join(' ');
      const idx = uniq.findIndex(h => r.includes(h));
      if (idx < 0) continue;
      if (idx < last) back.push(sec.split('\n')[0].trim());
      last = Math.max(last, idx);
    }
    if (back.length) console.warn(`warning deck sections out of the source's order: ${back.join(' | ')}`);
  }

  await ensureEngine();
  const tsconfig = prepareWorkdir(work, tag, only);
  try {
    execFileSync(path.join(ENGINE, 'node_modules/.bin/tsc'), ['-p', tsconfig, '--noEmit'], {stdio: 'pipe'});
  } catch (e) {
    problems.push(`type errors:\n${e.stdout}${e.stderr}`);
  }
  if (problems.length) die(problems.join('\n\nerror '));

  const entry = path.join(work, `.entry-${tag}.ts`);
  fs.writeFileSync(entry, [
    `import {startDeck} from ${JSON.stringify(path.join(ENGINE, 'deck.ts'))};`,
    ...built.map((id, i) => `import p${i} from './animations/${id}.ts?project';`),
    `startDeck([${built.map((id, i) => `[${JSON.stringify(id)}, p${i}]`).join(', ')}]);`,
  ].join('\n') + '\n');

  // The plugin resolves the editor package from the cwd; the work dir links node_modules.
  process.chdir(work);
  const {build: viteBuild} = await import('vite');
  const {default: canvasCommons} = await import('@canvas-commons/vite-plugin');
  const dist = path.join(work, `.dist-${tag}`);
  fs.rmSync(dist, {recursive: true, force: true});
  await viteBuild({
    root: work,
    configFile: false,
    cacheDir: path.join(work, `.vite-${tag}`), // not the engine's node_modules/.vite, shared by every deck
    logLevel: 'warn',
    plugins: [
      canvasCommons({project: built.map(id => `./animations/${id}.ts`)}),
      {
        // The plugin makes every project a build entry; we bundle one page entry instead.
        name: 'animate-single-entry',
        configResolved(c) {
          for (const k of ['rollupOptions', 'rolldownOptions'])
            if (c.build[k]) c.build[k].input = {page: entry};
        },
      },
    ],
    build: {
      outDir: dist,
      emptyOutDir: true,
      assetsInlineLimit: () => true,
      cssCodeSplit: false,
      modulePreload: false,
      chunkSizeWarningLimit: 1e9,
      rolldownOptions: {input: {page: entry}, output: {codeSplitting: false, entryFileNames: 'page.js'}},
    },
  });

  const files = fs.readdirSync(dist, {recursive: true}).map(String);
  const js = files.filter(f => f.endsWith('.js'));
  if (js.length !== 1) die(`expected one JS bundle, got: ${js.join(', ')}`);
  const bundle = fs.readFileSync(path.join(dist, js[0]), 'utf8');
  const css = files.filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(dist, f), 'utf8')).join('\n');

  const {marked} = await import('marked');
  const body = deckBody(marked, md, only);
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(work)).replace(/[*_`]/g, '');
  // Embed only what extract needs to rebuild: page.md, source.md and animations/
  // (not screenshots or logs an author left in the work dir).
  const sources = Object.fromEntries(walk(work)
    .filter(f => f === 'page.md' || f === 'source.md' || f.startsWith(`animations${path.sep}`))
    .map(f => {
      const data = fs.readFileSync(path.join(work, f));
      return [f.split(path.sep).join('/'), TEXT_FILE.test(f) ? data.toString('utf8') : {base64: data.toString('base64')}];
    }));
  const lang = opt.lang ?? 'en';
  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="animate (Canvas Commons)">
<title>${escapeHtml(title)}</title>
${THEME_HEAD}
<style>${fs.readFileSync(path.join(ENGINE, 'style.css'), 'utf8')}
${css}</style>
</head>
<body class="layout-deck">
${body}
<script type="application/json" id="${SOURCE_ID}">${Buffer.from(JSON.stringify(sources)).toString('base64')}</script>
<script type="module">${scriptSafe(bundle)}</script>
</body>
</html>
`;
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, html);
  console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB, ${built.length} animation(s)).`);
  if (!opt['no-verify'])
    await verify(out, built, path.join(work, '.frames'), {
      only: !!only,
      hashes: Object.fromEntries(built.map(id => [id, animationHash(work, id, ids, lang)])),
      isolate: pending => Promise.all(pending.map(id => new Promise(r =>
        execFile(process.execPath, [fileURLToPath(import.meta.url), 'build', work, '--only', id, '--lang', lang],
          (err, stdout, stderr) => r(/stopped responding|did not finish loading/.test(`${stdout}${stderr}`) ? id : null)))))
        .then(r => r.filter(Boolean)),
    });
}

async function openPage(browser, file) {
  // Light, so panels and cards render as the contact sheets do (canvas pixels are always light).
  const page = await browser.newPage({viewport: {width: 1200, height: 900}, colorScheme: 'light'});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(pathToFileURL(file).href);
  return {page, errors};
}

// Waits until every animation has computed its timing. A scene that never finishes (an endless
// loop) either keeps one animation pending or freezes the page; both fail within READY_MS and
// name the animations still pending, instead of hanging the build.
async function waitReady(page, ids, errors, isolate) {
  const TIMEOUT = Symbol('timeout');
  const within = (p, ms) => {
    let t;
    return Promise.race([p, new Promise(r => (t = setTimeout(r, ms, TIMEOUT)))]).finally(() => clearTimeout(t));
  };
  const deadline = Date.now() + READY_MS;
  let pending = ids, frozen = false;
  while (Date.now() < deadline) {
    const r = await within(page.evaluate(ids => {
      const w = window;
      w.__animateReady ??= {};
      for (const id of ids) {
        const h = w.__animate?.[id];
        if (h && !(id in w.__animateReady)) {
          w.__animateReady[id] = false;
          h.ready.then(() => (w.__animateReady[id] = true));
        }
      }
      return ids.filter(id => !w.__animateReady[id]);
    }, ids), 5000);
    frozen = r === TIMEOUT;
    if (frozen) break;
    pending = r;
    if (pending.length === 0) break;
    await sleep(250);
  }
  if ((frozen || pending.length) && pending.length > 1 && isolate) {
    // Every animation stalls when one scene freezes the page, so build each alone to find it.
    console.log(`Animations stalled (${pending.join(', ')}); building each alone to find which...`);
    const stuck = await isolate(pending);
    if (stuck.length) pending = stuck;
  }
  const hint = `Look for an endless loop in ${pending.length === 1 ? 'its scene' : 'their scenes'} (a while/for that never ends, ` +
    'a loop() without a count, waiting on a signal that never changes). `build <workdir> --only <id>` builds one animation alone.';
  if (frozen) die(`the page stopped responding while computing animation timing; not ready yet: ${pending.join(', ')}.\n${hint}`);
  if (pending.length) die(`animations did not finish loading within ${READY_MS / 1000} s: ${pending.join(', ')}.\n${errors.join('\n') || '(no console errors)'}\n${hint}`);
  try {
    await page.waitForFunction(ids => ids.every(id => document.querySelector(`[data-animation="${id}"] canvas`)), ids, {timeout: 10000});
  } catch {
    die(`the deck did not start within 10 s of its animations loading.\n${errors.join('\n') || '(no console errors)'}`);
  }
}

// Sheets and renders keep a .hash next to them; when it matches, the old image still shows
// exactly this build, so it isn't rendered again and the output says so.
function unchanged(png, hash) {
  try {
    return fs.existsSync(png) && fs.readFileSync(`${png.slice(0, -4)}.hash`, 'utf8') === hash;
  } catch {
    return false;
  }
}
const UNCHANGED = '\t(unchanged since the last build)';

// One contact sheet per animation. With steps (kit captions), one frame per
// step at its resting frame: exactly what the step buttons show. Without, 8
// evenly spaced frames. Two columns at ~0.42 scale, timestamped.
async function verify(file, ids, framesDir, {only = false, hashes = {}, isolate} = {}) {
  const browser = await launchBrowser();
  try {
    const {page, errors} = await openPage(browser, file);
    await waitReady(page, ids, errors, isolate);
    fs.mkdirSync(framesDir, {recursive: true});
    const keep = new Set();
    for (const id of ids) {
      const png = path.join(framesDir, `${id}.png`);
      keep.add(png);
      const skip = unchanged(png, hashes[id]);
      const {url, seconds, steps} = await page.evaluate(async ([id, render]) => {
        const h = window.__animate[id];
        await new Promise(r => setTimeout(r, 50)); // steps are read right after ready
        const last = h.duration();
        const ends = h.steps().ends;
        const info = {seconds: h.player.status.framesToSeconds(last), steps: ends.length};
        if (!render) return info;
        const frames = ends.length > 1
          ? ends.slice(0, 16)
          : Array.from({length: 8}, (_, i) => Math.round((last * (i + 0.5)) / 8));
        const n = frames.length, cols = 2, w = 800, hgt = 450;
        const sheet = document.createElement('canvas');
        sheet.width = cols * w;
        sheet.height = Math.ceil(n / cols) * (hgt + 24);
        const ctx = sheet.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        const src = document.querySelector(`[data-animation="${id}"] canvas`);
        for (let i = 0; i < n; i++) {
          await h.seek(Math.min(frames[i], last));
          const x = (i % cols) * w, y = Math.floor(i / cols) * (hgt + 24);
          ctx.drawImage(src, x, y + 24, w, hgt);
          ctx.strokeStyle = '#ccc';
          ctx.strokeRect(x, y + 24, w, hgt);
          ctx.fillStyle = '#000';
          ctx.font = '16px monospace';
          const label = ends.length > 1 ? `step ${i + 1}/${ends.length} · ` : '';
          ctx.fillText(`${label}${h.player.status.framesToSeconds(frames[i]).toFixed(1)} s`, x + 6, y + 18);
        }
        return {...info, url: sheet.toDataURL('image/png')};
      }, [id, !skip]);
      if (!skip) {
        fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
        if (hashes[id]) fs.writeFileSync(`${png.slice(0, -4)}.hash`, hashes[id]);
      }
      console.log(`${id}\t${seconds.toFixed(1)} s\t${steps > 1 ? `${steps} steps` : 'no steps'}\tcontact sheet ${png}${skip ? UNCHANGED : ''}`);
      if (steps > 16) console.warn(`warning ${id} has ${steps} steps; the sheet shows the first 16. Consider splitting it.`);
    }
    // Highlights should walk the quoted passage top-down: warn when a step's first
    // passage sits above the previous step's in the panel.
    const order = await page.evaluate(ids => ids.map(id => {
      const fig = document.querySelector(`[data-animation="${id}"]`);
      const note = document.querySelector(`.deck-note[data-section="${fig?.dataset.section}"]`) ?? document;
      const tops = window.__animate[id].steps().sources.map(ids =>
        ids.map(s => note.querySelector(`[data-src="${CSS.escape(s)}"]`)).filter(Boolean)
          .map(el => [...note.querySelectorAll('*')].indexOf(el)).sort((a, b) => a - b)[0] ?? null);
      const back = [];
      let last = -1;
      tops.forEach((t, i) => { if (t !== null) { if (t < last) back.push(i + 1); last = t; } });
      return {id, back};
    }), ids);
    for (const {id, back} of order)
      if (back.length) console.warn(`warning ${id}: highlights jump back up the panel at step(s) ${back.join(', ')}; quote the excerpts in the order the steps use them`);

    // A preview of a few animations stops here: panels, cards and the sandbox check are
    // about the whole deck, and other animations in the work dir may be half written.
    if (only) {
      if (errors.length) die(`the page logged errors:\n${errors.join('\n')}`);
      return;
    }

    // Render each side panel (all tied passages shown faint) and each text card,
    // so the prose gets reviewed like the canvases.
    const items = await page.evaluate(() => [
      ...[...document.querySelectorAll('.deck-note')].filter(n => n.textContent.trim()).map(n => ({kind: 'panel', section: n.dataset.section})),
      ...[...document.querySelectorAll('.deck-card')].map(c => ({kind: 'card', section: c.dataset.section})),
    ]);
    const css = fs.readFileSync(path.join(ENGINE, 'style.css'), 'utf8');
    for (const it of items) {
      const {h, html} = await page.evaluate(({kind, section}) => {
        document.getElementById('__probe')?.remove();
        const src = document.querySelector(kind === 'panel' ? `.deck-note[data-section="${section}"]` : `.deck-card[data-section="${section}"] .deck-card-body`);
        const probe = document.createElement(kind === 'panel' ? 'aside' : 'div');
        probe.id = '__probe';
        // Not .deck-notes: the deck hides that panel on cards and narrow screens.
        probe.className = kind === 'panel' ? '' : 'deck-card-body';
        probe.setAttribute('style', `position:absolute;left:0;top:0;z-index:99999;background:#fffdf8;padding:18px 22px;box-sizing:border-box;width:${kind === 'panel' ? 480 : 1100}px;max-width:none;${kind === 'panel' ? 'font-size:15px;line-height:1.55' : ''}`);
        const clone = src.cloneNode(true);
        clone.classList.add('active');
        clone.querySelectorAll('[data-src]').forEach(m => m.classList.add('seen'));
        probe.append(clone);
        document.body.append(probe);
        return {h: probe.getBoundingClientRect().height, html: probe.outerHTML};
      }, it);
      const png = path.join(framesDir, `${it.kind}-${it.section}.png`);
      keep.add(png);
      const hash = crypto.createHash('sha256').update(html).update(css).digest('hex');
      const skip = unchanged(png, hash);
      if (!skip) {
        await page.setViewportSize({width: 1200, height: Math.max(900, Math.ceil(h) + 20)});
        await page.locator('#__probe').screenshot({path: png});
        fs.writeFileSync(`${png.slice(0, -4)}.hash`, hash);
      }
      console.log(`${it.kind} ${it.section}\t${png}${skip ? UNCHANGED : ''}`);
    }
    // Drop renders of animations and sections the deck no longer has.
    for (const f of fs.readdirSync(framesDir)) {
      const p = path.join(framesDir, f);
      if (/\.(png|hash)$/.test(f) && !keep.has(p.replace(/\.hash$/, '.png'))) fs.rmSync(p);
    }
    if (errors.length) die(`the page logged errors:\n${errors.join('\n')}`);
    await page.close();
    await verifySandboxed(browser, file);
  } finally {
    await browser.close();
  }
}

// Some hosts (agent apps) preview an attached HTML file in a sandboxed srcdoc
// iframe: opaque origin, no storage, strict CSP. The deck must still play there.
async function verifySandboxed(browser, file) {
  const p = await browser.newPage({viewport: {width: 1200, height: 900}});
  const pageErrors = [];
  p.on('pageerror', e => pageErrors.push(String(e)));
  await p.setContent('<!doctype html><body style="margin:0">');
  const csp = ["default-src 'none'", "script-src 'unsafe-inline' 'unsafe-eval' blob:", "style-src 'unsafe-inline'",
    'img-src data: blob:', 'font-src data:', 'media-src data: blob:', "connect-src 'none'", "form-action 'none'",
    "base-uri 'none'", "frame-src 'none'", "object-src 'none'"].join('; ');
  await p.evaluate(([csp, html]) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.style.cssText = 'width:1200px;height:900px;border:0';
    f.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}">` + html;
    document.body.append(f);
  }, [csp, fs.readFileSync(file, 'utf8')]);
  const f = await (await p.waitForSelector('iframe')).contentFrame();
  await f.waitForFunction(() => document.querySelector('.deck-count')?.textContent, null, {timeout: 30000}).catch(() => {});
  const hasAnim = await f.evaluate(() => !!document.querySelector('.deck-stage [data-animation]'));
  // Step through until an animation is current, then it must advance.
  let moved = !hasAnim;
  for (let i = 0; i < 4 && !moved; i++) {
    await f.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true})));
    moved = await f.waitForFunction(
      () => Math.max(0, ...Object.values(window.__animate ?? {}).map(h => h.player.onFrameChanged.current)) > 0,
      null, {timeout: 1500},
    ).then(() => true, () => false);
  }
  await p.close();
  if (pageErrors.length) die(`the deck throws in a sandboxed iframe (agent-app HTML preview):\n${pageErrors.join('\n')}`);
  if (!moved) die('the deck does not animate in a sandboxed iframe (agent-app HTML preview).');
  console.log('sandboxed-iframe check: ok');
}

async function frames(file, id, secs) {
  const browser = await launchBrowser();
  try {
    const {page, errors} = await openPage(browser, path.resolve(file));
    await waitReady(page, [id], errors);
    for (const s of secs.map(Number)) {
      const url = await page.evaluate(async ([id, s]) => {
        const h = window.__animate[id];
        await h.seek(Math.min(h.duration(), h.player.status.secondsToFrames(s)));
        return document.querySelector(`[data-animation="${id}"] canvas`).toDataURL('image/png');
      }, [id, s]);
      // Keyed by the page's full path, so parallel builds of same-named pages don't collide.
      const dir = path.join(os.tmpdir(), 'animate-stills', path.resolve(file).replace(/[^A-Za-z0-9]+/g, '_').slice(-120));
      fs.mkdirSync(dir, {recursive: true});
      const png = path.join(dir, `${id}-${s}s.png`);
      fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
      console.log(png);
    }
  } finally {
    await browser.close();
  }
}

function extract(file, work) {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(new RegExp(`<script type="application/json" id="${SOURCE_ID}">([^<]*)</script>`));
  if (!m) die(`${file} has no embedded sources`);
  const sources = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
  // The page may come from someone else: write only what build embeds, and only inside the work dir.
  const root = path.resolve(work);
  const files = Object.entries(sources).map(([rel, v]) => {
    const p = path.resolve(root, rel);
    const allowed = rel === 'page.md' || rel === 'source.md' || /^animations\/[^\\]+$/.test(rel);
    if (!allowed || rel.split('/').includes('..') || !p.startsWith(root + path.sep))
      die(`${file} embeds an unexpected path "${rel}"; refusing to extract`);
    return [p, typeof v === 'string' ? v : Buffer.from(v.base64, 'base64')];
  });
  for (const [p, data] of files) {
    fs.mkdirSync(path.dirname(p), {recursive: true});
    fs.writeFileSync(p, data);
  }
  console.log(`Extracted ${files.length} file(s) to ${root}.`);
}

const [cmd, ...rest] = process.argv.slice(2);
const {pos, opt} = parseArgs(rest);
if (cmd === 'build' && pos[0]) await build(pos[0], opt);
else if (cmd === 'frames' && pos.length >= 3) { await ensureEngine(); await frames(pos[0], pos[1], pos.slice(2)); }
else if (cmd === 'setup') await setup();
else if (cmd === 'extract' && pos.length === 2) extract(pos[0], pos[1]);
else die('usage: setup | build <workdir> [--out f.html] [--lang xx] [--cover-depth n] [--replace] [--no-verify] [--only id[,id]] | frames <page.html> <id> <s>... | extract <page.html> <workdir>');
