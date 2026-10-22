// Builds the unpacked extension into dist/ (the folder to choose in "Load unpacked").
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { DEFAULT_MODEL } from '../src/core/config.js';
import { MODELS } from '../src/embed/embedder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const r = (...p) => path.join(root, ...p);

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

await esbuild.build({
  entryPoints: {
    panel: r('src/sidepanel/panel.js'),
    worker: r('src/embed/worker.js'),
    background: r('src/background.js'),
    'bench/bench': r('src/bench/bench.js'),
  },
  outdir: dist,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome116'],
  minify: false, // readable bundles make review of the release easier
  sourcemap: false,
  legalComments: 'external',
  logLevel: 'warning',
  // Transformers.js references Node-only modules behind runtime checks; they are never loaded in the browser.
  external: ['onnxruntime-node', 'sharp', 'fs', 'path', 'url'],
});

const copy = (from, to) => fs.cp(r(from), path.join(dist, to), { recursive: true });
const manifest = JSON.parse(await fs.readFile(r('manifest.json'), 'utf8'));
manifest.version = JSON.parse(await fs.readFile(r('package.json'), 'utf8')).version;
await fs.writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
await copy('src/sidepanel/index.html', 'sidepanel.html');
await copy('src/sidepanel/panel.css', 'panel.css');
await copy('src/bench/bench.html', 'bench/bench.html');
await copy('src/sidepanel/panel.css', 'bench/panel.css');
await copy('assets/icons', 'icons');

// ONNX Runtime WebAssembly files, served from the extension itself (MV3 forbids remote code).
const ortDir = r('node_modules/@huggingface/transformers/dist');
await fs.mkdir(path.join(dist, 'ort'), { recursive: true });
for (const f of await fs.readdir(ortDir)) if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) await fs.copyFile(path.join(ortDir, f), path.join(dist, 'ort', f));

// Demo indexes for every model profile that has been built, plus licence and sources.
for (const key of Object.keys(MODELS)) {
  try {
    await fs.access(r('demo/data', key, 'corpus.json'));
    await copy(`demo/data/${key}`, `demo/${key}`);
  } catch {
    if (key === DEFAULT_MODEL) throw new Error(`Demo index for the default model is missing. Run: node demo/build-demo.mjs --model ${key}`);
    console.warn(`(no demo index for ${key}; that model will have no demo in this build)`);
  }
}
await copy('demo/LICENSE-DEMO.md', 'demo/LICENSE-DEMO.md');
await copy('demo/sources.json', 'demo/sources.json');

// Evaluation questions for the in-browser benchmark page.
await copy('eval/questions.test.json', 'bench/questions.test.json');
await copy('eval/questions.practice.json', 'bench/questions.practice.json');

const size = async (dir) => {
  let total = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) total += e.isDirectory() ? await size(path.join(dir, e.name)) : (await fs.stat(path.join(dir, e.name))).size;
  return total;
};
console.log(`Built dist/ (${((await size(dist)) / 2 ** 20).toFixed(1)} MB). Load it via chrome://extensions → Developer mode → Load unpacked.`);
