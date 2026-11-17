// Shared helpers for the Node evaluation scripts.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromStored } from '../src/core/serialize.js';
import { nodeEmbedder } from '../scripts/node-embedder.mjs';
import { createLLM, PROVIDERS } from '../src/llm/client.js';

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

// Reads KEY=value lines from rewind/.env (never printed). Existing environment variables win.
export async function loadEnv() {
  try {
    const text = await fs.readFile(path.join(rootDir, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

// LLM rewriter for evaluation, with a disk cache so runs are reproducible and not re-billed.
// The cache stores the rewrites and the measured API latency of the original call.
export async function cachedRewriter(provider, model) {
  await loadEnv();
  const envName = provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
  const p = PROVIDERS[provider];
  const m = model || p.defaultModel;
  const file = path.join(evalDir, 'results', `llm-cache-${provider}-${m.replace(/[^\w.-]+/g, '_')}.json`);
  let cache = {};
  try {
    cache = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}
  if (!process.env[envName] && !Object.keys(cache).length) {
    console.error(`LLM mode needs ${envName}: add a line ${envName}=... to rewind/.env (the key is never printed).`);
    process.exit(2);
  }
  let llm = null;
  const stats = { calls: 0, cached: 0, errors: 0 };
  const rewrite = async (q) => {
    if (cache[q]) {
      stats.cached++;
      rewrite.lastMs = cache[q].ms;
      return cache[q].queries;
    }
    if (!process.env[envName]) throw new Error(`${envName} is not set (add it to rewind/.env)`);
    llm ??= createLLM({ provider, model: m, apiKey: process.env[envName], timeoutMs: 20000 });
    stats.calls++;
    try {
      const r = await llm.rewriteQuery(q);
      cache[q] = { queries: r.queries, ms: r.ms, at: new Date().toISOString() };
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(cache, null, 2));
      return r.queries;
    } catch (e) {
      stats.errors++;
      throw e;
    }
  };
  return { rewrite, provider, model: m, cacheFile: file, stats, cachedLatency: (q) => cache[q]?.ms ?? null };
}
