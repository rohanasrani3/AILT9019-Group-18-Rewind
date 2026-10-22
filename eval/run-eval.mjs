// Runs the evaluation: hybrid retrieval vs the keyword-only baseline over identical captions.
//   node eval/run-eval.mjs [--set test|practice] [--model e5-small|minilm-l12]
// Writes eval/results/<date>-<set>-<model>.json and .md.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareQuestions, runQuestions, summarize, checkTargets, ANSWERABLE } from '../src/eval/metrics.js';
import { configFor, DEFAULT_MODEL } from '../src/core/config.js';
import { modelArg } from '../scripts/node-embedder.mjs';
import { loadDemoIndex, loadQuestionFile, cachedEmbedder, evalDir } from './common.mjs';

const argv = process.argv;
const set = argv.includes('--set') ? argv[argv.indexOf('--set') + 1] : 'test';
const modelKey = modelArg() ?? DEFAULT_MODEL;

const index = await loadDemoIndex(modelKey);
const qfile = await loadQuestionFile(set);
const questions = prepareQuestions(qfile, index);
const unverified = questions.filter((q) => q.status !== 'verified').length;
const provisional = unverified > 0 || (set === 'test' && !qfile.frozen);

const emb = await cachedEmbedder(modelKey);
// Warm-up (model compiled, caches hot) before latency is measured, as the proposal specifies.
for (const q of ['warm up', '预热', 'master theorem']) await emb.raw.embedQuery(q);

const config = configFor(modelKey);
// Latency uses the real (un-memoised) embedder so query embedding time is included.
const hybridRecords = await runQuestions(index, questions, { embedQuery: emb.raw.embedQuery, config });
const baselineRecords = await runQuestions(index, questions, { config, keywordOnly: true });
const hybrid = summarize(hybridRecords);
const baseline = summarize(baselineRecords);
const targets = set === 'test' ? checkTargets(hybrid, baseline) : [];

const cpus = os.cpus();
const report = {
  generatedAt: new Date().toISOString(),
  set,
  model: index.model,
  config,
  provisional,
  provisionalReason: provisional ? `${unverified} of ${questions.length} questions are unverified${set === 'test' && !qfile.frozen ? '; test set not frozen' : ''}` : null,
  machine: { cpu: cpus[0]?.model?.trim(), cores: cpus.length, ramGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}`, node: process.version, runtime: 'Node (onnxruntime-node). Browser latency: open bench.html in the extension.' },
  corpus: { videos: index.videos.length, windows: index.windows.length, captionHours: +(index.videos.reduce((a, v) => a + (v.duration ?? 0), 0) / 3600).toFixed(2), indexingMs: index.buildStats?.indexingMs, buildMachine: index.buildStats?.machine },
  modelLoadMs: Math.round(emb.loadMs),
  hybrid,
  baseline,
  targets,
  records: { hybrid: hybridRecords, baseline: baselineRecords },
};

const pct = (a, n) => (n ? `${a}/${n} (${Math.round((100 * a) / n)}%)` : '—');
const lines = [];
lines.push(`# Rewind evaluation — ${set} set, ${modelKey}`);
lines.push('');
if (provisional) lines.push(`> **PROVISIONAL — not reportable as final results.** ${report.provisionalReason}.`, '');
lines.push(`Generated ${report.generatedAt} · ${report.machine.cpu}, ${report.machine.cores} threads, ${report.machine.ramGB} GB RAM · ${report.machine.platform} · Node ${process.version}`);
lines.push(`Corpus: ${report.corpus.videos} videos, ${report.corpus.captionHours} h captions, ${report.corpus.windows} windows · index build ${report.corpus.indexingMs} ms · model load ${report.modelLoadMs} ms`);
lines.push('');
lines.push('| Type | N | Hybrid Hit@1 | Hybrid Hit@3 | Keyword Hit@1 | Keyword Hit@3 |');
lines.push('|---|---|---|---|---|---|');
for (const t of ANSWERABLE) {
  const h = hybrid.byType[t];
  const b = baseline.byType[t];
  lines.push(`| ${t} | ${h.n} | ${pct(h.hit1, h.n)} | ${pct(h.hit3, h.n)} | ${pct(b.hit1, b.n)} | ${pct(b.hit3, b.n)} |`);
}
lines.push(`| **all answerable** | ${hybrid.answerable.n} | ${pct(hybrid.answerable.hit1, hybrid.answerable.n)} | ${pct(hybrid.answerable.hit3, hybrid.answerable.n)} | ${pct(baseline.answerable.hit1, baseline.answerable.n)} | ${pct(baseline.answerable.hit3, baseline.answerable.n)} |`);
lines.push('');
lines.push(`Not found correct: hybrid ${pct(hybrid.byType.not_covered.correct, hybrid.byType.not_covered.n)}, keyword ${pct(baseline.byType.not_covered.correct, baseline.byType.not_covered.n)}`);
lines.push(`Refusals: ${pct(hybrid.byType.assessment.correct, hybrid.byType.assessment.n)} · false refusals on answerable questions: ${ANSWERABLE.reduce((a, t) => a + hybrid.byType[t].falseRefusals, 0)}`);
lines.push(`Median local retrieval latency (hybrid, after warm-up, Node): ${hybrid.medianLatencyMs?.toFixed(1)} ms`);
if (targets.length) {
  lines.push('', '## Proposal targets', '', '| Target | Value | Pass |', '|---|---|---|');
  for (const r of targets) lines.push(`| ${r.target} | ${r.value} | ${r.pass ? 'yes' : '**no**'} |`);
}
lines.push('', '## Per-question (hybrid)', '', '| ID | Type | Query | Status | Top results | Correct |', '|---|---|---|---|---|---|');
for (const r of hybridRecords) lines.push(`| ${r.id} | ${r.type} | ${r.query} | ${r.status} | ${r.top.map((t) => `L${t.lecture}@${t.time}`).join(', ') || '—'} | ${r.correct ? 'yes' : '**no**'} |`);

const stamp = report.generatedAt.slice(0, 10);
const base = path.join(evalDir, 'results', `${stamp}-${set}-${modelKey}`);
await fs.mkdir(path.dirname(base), { recursive: true });
await fs.writeFile(`${base}.json`, JSON.stringify(report, null, 2));
await fs.writeFile(`${base}.md`, lines.join('\n') + '\n');
console.log(lines.slice(0, 30 + targets.length).join('\n'));
console.log(`\nWrote ${base}.json and .md`);
