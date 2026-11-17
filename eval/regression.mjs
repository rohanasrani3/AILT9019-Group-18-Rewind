// Checks that local-only search (no LLM) still returns exactly the official v0.1 results on the
// frozen test set: same status and same top-3 (lecture, start) for every question, for the
// hybrid run and the keyword baseline. Exit code 1 on any difference.
//   node eval/regression.mjs [--model minilm-l12] [--official eval/results/2026-11-17-test-minilm-l12.json]
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareQuestions, runQuestions } from '../src/eval/metrics.js';
import { configFor, DEFAULT_MODEL } from '../src/core/config.js';
import { modelArg } from '../scripts/node-embedder.mjs';
import { loadDemoIndex, loadQuestionFile, cachedEmbedder, evalDir } from './common.mjs';

const modelKey = modelArg() ?? DEFAULT_MODEL;
const argv = process.argv;
const officialPath = argv.includes('--official') ? argv[argv.indexOf('--official') + 1] : path.join(evalDir, 'results', `2026-11-17-test-${modelKey}.json`);
const official = JSON.parse(await fs.readFile(officialPath, 'utf8'));

const index = await loadDemoIndex(modelKey);
const questions = prepareQuestions(await loadQuestionFile('test'), index);
const emb = await cachedEmbedder(modelKey);
const config = configFor(modelKey);
const now = {
  hybrid: await runQuestions(index, questions, { embedQuery: emb.embedQuery, config }),
  baseline: await runQuestions(index, questions, { config, keywordOnly: true }),
};

const sig = (r) => `${r.status}|${r.top.map((t) => `${t.lecture}@${t.start}`).join(',')}`;
let diffs = 0;
for (const mode of ['hybrid', 'baseline']) {
  const before = new Map(official.records[mode].map((r) => [r.id, sig(r)]));
  for (const r of now[mode]) {
    if (before.get(r.id) !== sig(r)) {
      diffs++;
      console.log(`DIFF ${mode} ${r.id}: official ${before.get(r.id)}  now ${sig(r)}`);
    }
  }
}
console.log(diffs ? `${diffs} difference(s) from ${path.basename(officialPath)}` : `OK: local-only results identical to ${path.basename(officialPath)} (${questions.length} questions × 2 modes)`);
process.exit(diffs ? 1 : 0);
