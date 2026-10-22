// Shared helpers for the Node evaluation scripts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromStored } from '../src/core/serialize.js';
import { nodeEmbedder } from '../scripts/node-embedder.mjs';

export const evalDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.join(evalDir, '..');

export async function loadDemoIndex(modelKey) {
  const dir = path.join(rootDir, 'demo', 'data', modelKey);
  const json = JSON.parse(await fs.readFile(path.join(dir, 'corpus.json'), 'utf8'));
  const buf = await fs.readFile(path.join(dir, 'vectors.bin'));
  return fromStored(json, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export async function loadQuestionFile(name) {
  return JSON.parse(await fs.readFile(path.join(evalDir, `questions.${name}.json`), 'utf8'));
}

// Embedder whose query vectors are memoised (grid search re-runs the same questions many times).
export async function cachedEmbedder(modelKey) {
  const e = nodeEmbedder(modelKey);
  const t = performance.now();
  await e.load();
  const loadMs = performance.now() - t;
  const memo = new Map();
  return {
    loadMs,
    raw: e,
    embedQuery: async (q) => {
      if (!memo.has(q)) memo.set(q, await e.embedQuery(q));
      return memo.get(q);
    },
  };
}
