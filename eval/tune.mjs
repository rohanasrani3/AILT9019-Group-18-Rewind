// Tunes thresholds, fusion and snapping on the PRACTICE set only, for each model profile, and
// compares the models on that set. Never reads the test set.
//   node eval/tune.mjs                 -> print best settings per model
//   node eval/tune.mjs --write         -> also write them into src/core/config.js (TUNED block)
//   node eval/tune.mjs --write --pick-default  -> also set DEFAULT_MODEL to the practice-set winner
import fs from 'node:fs/promises';
import path from 'node:path';
import { prepareQuestions, runQuestions, summarize } from '../src/eval/metrics.js';
import { configFor, MODEL_DEFAULTS, TUNED } from '../src/core/config.js';
import { MODELS } from '../src/embed/embedder.js';
import { loadDemoIndex, loadQuestionFile, cachedEmbedder, rootDir } from './common.mjs';

const write = process.argv.includes('--write');
const pickDefault = process.argv.includes('--pick-default');
const qfile = await loadQuestionFile('practice');

const range = (a, b, step) => {
  const out = [];
  for (let x = a; x <= b + 1e-9; x += step) out.push(+x.toFixed(4));
  return out;
};
const GRID = {
  'e5-small': { tauV: range(0.8, 0.87, 0.005), delta: [0, 0.02, 0.04] },
  'minilm-l12': { tauV: range(0.35, 0.65, 0.025), delta: [0, 0.05, 0.1] },
};
const SHARED = { rrfK: [20, 60], maxSnap: [0, 20] };
const KW = { kwMinCoverage: [0.4, 0.5, 0.6, 0.75, 1], kwMinScore: [0, 2, 4, 6, 8] };

// Objective: answerable Hit@3 + correct not-found (counts), then Hit@1 as tie-break.
const objective = (s) => [s.answerable.hit3 + s.byType.not_covered.correct, s.answerable.hit1];
const better = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

const results = {};
for (const modelKey of Object.keys(MODELS)) {
  let index;
  try {
    index = await loadDemoIndex(modelKey);
  } catch {
    console.log(`${modelKey}: no demo index (run: node demo/build-demo.mjs --model ${modelKey}) — skipped`);
    continue;
  }
  const questions = prepareQuestions(qfile, index);
  const emb = await cachedEmbedder(modelKey);
  const base = configFor(modelKey);
  const gap = MODEL_DEFAULTS[modelKey].tauStrong - MODEL_DEFAULTS[modelKey].tauV;

  let best = null;
  for (const tauV of GRID[modelKey].tauV)
    for (const delta of GRID[modelKey].delta)
      for (const rrfK of SHARED.rrfK)
        for (const maxSnap of SHARED.maxSnap) {
          const config = { ...base, tauV, delta, rrfK, maxSnap, tauStrong: +(tauV + gap).toFixed(4) };
          const s = summarize(await runQuestions(index, questions, { embedQuery: emb.embedQuery, config }));
          const o = objective(s);
          if (!best || better(o, best.o)) best = { o, s, params: { tauV, delta, rrfK, maxSnap, tauStrong: config.tauStrong } };
        }

  // The keyword baseline gets its own thresholds tuned on the same practice set, so it is a fair baseline.
  let bestKw = null;
  for (const kwMinCoverage of KW.kwMinCoverage)
    for (const kwMinScore of KW.kwMinScore) {
      const config = { ...base, ...best.params, kwMinCoverage, kwMinScore };
      const s = summarize(await runQuestions(index, questions, { config, keywordOnly: true }));
      const o = objective(s);
      if (!bestKw || better(o, bestKw.o)) bestKw = { o, s, params: { kwMinCoverage, kwMinScore } };
    }

  results[modelKey] = { hybrid: best, keyword: bestKw };
  const fmt = (s) => `Hit@1 ${s.answerable.hit1}/${s.answerable.n}, Hit@3 ${s.answerable.hit3}/${s.answerable.n}, not-found ${s.byType.not_covered.correct}/${s.byType.not_covered.n}, refusals ${s.byType.assessment.correct}/${s.byType.assessment.n}`;
  console.log(`\n${modelKey}\n  hybrid  ${fmt(best.s)}  ${JSON.stringify(best.params)}\n  keyword ${fmt(bestKw.s)}  ${JSON.stringify(bestKw.params)}`);
  for (const t of ['exact', 'paraphrased', 'zh_mixed']) console.log(`    ${t.padEnd(12)} hybrid Hit@3 ${best.s.byType[t].hit3}/${best.s.byType[t].n}`);
}

const ranked = Object.entries(results).sort(([, a], [, b]) => (better(a.hybrid.o, b.hybrid.o) ? -1 : better(b.hybrid.o, a.hybrid.o) ? 1 : 0));
const winner = ranked[0]?.[0];
console.log(`\nPractice-set winner: ${winner}${ranked.length > 1 && !better(ranked[0][1].hybrid.o, ranked[1][1].hybrid.o) ? ' (tie)' : ''}`);
console.log('Caution: 15 practice questions is a small tuning set; expect some optimism. Never tune on the test set.');

if (write) {
  const tuned = { ...TUNED };
  for (const [k, r] of Object.entries(results)) tuned[k] = { ...r.hybrid.params, ...r.keyword.params };
  const file = path.join(rootDir, 'src', 'core', 'config.js');
  let src = await fs.readFile(file, 'utf8');
  src = src.replace(
    /\/\/ --- TUNED \(written by eval\/tune\.mjs\) ---[\s\S]*?\/\/ --- END TUNED ---/,
    `// --- TUNED (written by eval/tune.mjs) ---\n// Tuned on eval/questions.practice.json, ${new Date().toISOString().slice(0, 10)}.\nexport const TUNED = ${JSON.stringify(tuned, null, 2)};\n// --- END TUNED ---`
  );
  if (pickDefault && winner) src = src.replace(/export const DEFAULT_MODEL = '[^']+';/, `export const DEFAULT_MODEL = '${winner}';`);
  await fs.writeFile(file, src);
  console.log(`Wrote TUNED${pickDefault ? ` and DEFAULT_MODEL='${winner}'` : ''} to src/core/config.js`);
}
