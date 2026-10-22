// Builds the bundled demo index from openly licensed MIT OCW caption files.
//   node demo/build-demo.mjs [--model e5-small|minilm-l12]  -> demo/data/<model>/corpus.json + vectors.bin
// Raw caption files are cached in demo/raw/ so annotation tools can read the exact source text.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseCaptions } from '../src/core/captions.js';
import { buildCourseIndex } from '../src/core/indexer.js';
import { toStored } from '../src/core/serialize.js';
import { MODELS, DEFAULT_MODEL } from '../src/embed/embedder.js';
import { nodeEmbedder, modelArg } from '../scripts/node-embedder.mjs';

const modelKey = modelArg() ?? DEFAULT_MODEL;
const profile = MODELS[modelKey];

const here = path.dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(await fs.readFile(path.join(here, 'sources.json'), 'utf8'));
const rawDir = path.join(here, 'raw');
const outDir = path.join(here, 'data', modelKey);
await fs.mkdir(rawDir, { recursive: true });
await fs.mkdir(outDir, { recursive: true });

async function captionsFor(lec) {
  const file = path.join(rawDir, `lecture-${String(lec.n).padStart(2, '0')}.vtt`);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    const res = await fetch(lec.captions);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${lec.captions}`);
    const text = await res.text();
    await fs.writeFile(file, text);
    return text;
  }
}

const videos = [];
for (const lec of src.lectures) {
  let cues = null;
  let error = null;
  try {
    cues = parseCaptions(await captionsFor(lec));
  } catch (e) {
    error = String(e.message ?? e);
  }
  const duration = cues?.length ? Math.ceil(cues[cues.length - 1].end) : null;
  videos.push({
    id: lec.youtubeId,
    kind: 'youtube',
    n: lec.n,
    title: lec.title,
    url: `https://www.youtube.com/watch?v=${lec.youtubeId}`,
    sourcePage: lec.page,
    captionSource: lec.captions,
    license: lec.license,
    duration,
    cues,
    ...(error ? { captionStatus: 'error', error } : {}),
  });
  console.log(`L${lec.n}: ${cues?.length ?? 0} cues${error ? ` (ERROR ${error})` : ''}`);
}

const embedder = nodeEmbedder(modelKey);
let t = performance.now();
await embedder.load();
const modelLoadMs = performance.now() - t;

t = performance.now();
let lastLog = 0;
const index = await buildCourseIndex(
  { courseId: src.courseId, title: src.title, source: 'demo', license: src.license, licenseUrl: src.licenseUrl, courseUrl: src.courseUrl, model: { key: modelKey, id: profile.id, revision: profile.revision, dtype: profile.dtype } },
  videos,
  {
    embedPassages: embedder.embedPassages,
    dim: profile.dim,
    onProgress: ({ done, total }) => {
      if (done - lastLog >= 500 || done === total) {
        lastLog = done;
        console.log(`  embedded ${done}/${total}`);
      }
    },
  }
);
const indexMs = performance.now() - t;

const { json, vectors } = toStored(index);
json.buildStats = {
  windows: json.windows.length,
  videos: json.videos.length,
  totalCaptionSeconds: json.videos.reduce((a, v) => a + (v.duration ?? 0), 0),
  modelLoadMs: Math.round(modelLoadMs),
  indexingMs: Math.round(indexMs),
  machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, ramGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}`, node: process.version },
};
await fs.writeFile(path.join(outDir, 'corpus.json'), JSON.stringify(json));
await fs.writeFile(path.join(outDir, 'vectors.bin'), Buffer.from(vectors));
console.log(JSON.stringify(json.buildStats, null, 2));
console.log('Boundaries per video:', Object.values(json.boundaries).map((b) => b.length).join(', '));
