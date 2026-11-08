#!/usr/bin/env node
// Usage:
//   node build.mjs [--vault <dir>] [--dir <subfolder>] [--check] [--force] [--open] [name ...] <<'EOF' ... EOF
//     stdin is a module exporting functions that return a Scene; Scene, C, FS, FONT are in scope.
//     Lints every scene, writes <name>.excalidraw.md into the vault only if all are clean.
//     --vault   vault root (default $OBSIDIAN_VAULT)   --dir  subfolder inside the vault (default: root)
//     --check   lint only, write nothing               --force write despite lint issues
//     --open    ask Obsidian to open each file (obsidian:// URI; needs the vault registered in Obsidian)
//   node build.mjs <scenes.mjs> [...]   same, reading a file that imports lib.mjs itself
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { toObsidianMd } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return false; args.splice(i, 1); return true; };
const opt = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };

const check = flag("--check");
const force = flag("--force");
const open = flag("--open");
const vault = opt("--vault") ?? process.env.OBSIDIAN_VAULT;
const sub = opt("--dir") ?? "";

let S;
if (args[0]?.endsWith(".mjs")) {
  S = await import(pathToFileURL(path.resolve(args.shift())).href);
} else {
  if (process.stdin.isTTY) { console.error("usage: node build.mjs [--vault dir] [--dir sub] [--check] [--open] [name ...] <<'EOF' ... EOF"); process.exit(2); }
  const lib = new URL("./lib.mjs", import.meta.url).href;
  const src = `import { Scene, C, FS, FONT } from ${JSON.stringify(lib)};\n` + fs.readFileSync(0, "utf8");
  S = await import("data:text/javascript," + encodeURIComponent(src));
}
const names = Object.keys(S)
  .filter((n) => typeof S[n] === "function" && (!args.length || args.includes(n)))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!names.length) { console.error("no exported scene functions"); process.exit(2); }

const built = [];
let problems = 0;
for (const n of names) {
  const scene = S[n]();
  const issues = scene.lint();
  problems += issues.length;
  console.log(issues.length ? `${n}: ${issues.length} lint issue(s)\n  ` + issues.join("\n  ") : `${n}: lint ok`);
  built.push([n, toObsidianMd(scene), scene.els.length]);
}
if (problems && !force) { if (!check) console.log("not written: fix lint issues or pass --force"); process.exit(1); }
if (check) process.exit(0);
if (!vault) { console.error("no vault: pass --vault <dir> or set OBSIDIAN_VAULT"); process.exit(2); }
if (!fs.existsSync(path.join(vault, ".obsidian"))) { console.error(`${vault} has no .obsidian folder; is it a vault root?`); process.exit(2); }

const dir = path.join(vault, sub);
fs.mkdirSync(dir, { recursive: true });
for (const [n, md, count] of built) {
  const rel = path.join(sub, `${n}.excalidraw.md`);
  fs.writeFileSync(path.join(vault, rel), md);
  const uri = `obsidian://open?vault=${encodeURIComponent(path.basename(vault))}&file=${encodeURIComponent(rel.replace(/\.md$/, ""))}`;
  console.log(`${n}\t${count} elements\t${path.join(vault, rel)}\t${uri}`);
  if (open && process.platform === "darwin") execFileSync("open", [uri]);
}
