#!/usr/bin/env node
// Usage:
//   node build.mjs [--check] [--force] [--out <dir>] [name ...] <<'EOF' ... EOF
//     stdin is a module exporting functions that return a Scene; Scene, C, FS, FONT are in scope.
//     Lints every scene, uploads only if all are clean. One link per export (or per listed name).
//     --check  lint only, no upload    --force  upload despite lint issues
//     --out    also write <name>.excalidraw files to <dir>
//   node build.mjs <scenes.mjs> [...]                same, reading a file that imports lib.mjs itself
//   node build.mjs --file <scene.excalidraw> [...]   upload existing .excalidraw files as-is
//   node build.mjs --fetch <link> [--out <file>]     download a #json= link (e.g. one the user edited) to .excalidraw
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { upload, verify, fetchScene, parseLink } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i < 0) return false; args.splice(i, 1); return true; };
const opt = (f) => { const i = args.indexOf(f); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };

async function publish(name, json) {
  const { id, k, url } = await upload(json);
  const n = await verify(id, k);
  console.log(`${name}\t${n} elements\t${url}`);
}

if (flag("--fetch")) {
  const out = opt("--out") ?? "fetched.excalidraw";
  fs.writeFileSync(out, await fetchScene(...parseLink(args[0])));
  console.log(`wrote ${out}`);
  process.exit(0);
}

if (flag("--file")) {
  for (const f of args) await publish(path.basename(f), fs.readFileSync(f, "utf8"));
  process.exit(0);
}

const check = flag("--check");
const force = flag("--force");
const outDir = opt("--out");

let S;
if (args[0]?.endsWith(".mjs")) {
  S = await import(pathToFileURL(path.resolve(args.shift())).href);
} else {
  if (process.stdin.isTTY) { console.error("usage: node build.mjs [--check] [--force] [--out dir] [name ...] <<'EOF' ... EOF"); process.exit(2); }
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
  const json = scene.json();
  if (outDir) fs.writeFileSync(path.join(outDir, `${n}.excalidraw`), json);
  built.push([n, json]);
}
if (problems && !force) { if (!check) console.log("not uploaded: fix lint issues or pass --force"); process.exit(1); }
if (check) process.exit(0);
for (const [n, json] of built) await publish(n, json);
