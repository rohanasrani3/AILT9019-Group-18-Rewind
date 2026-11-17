// Writes the LLM-mode results (from the newest eval/results/*-test-<model>-llm-*.json) into the
// marked blocks of docs/index.html and README.md, next to the official local-only numbers.
//   node eval/llm-report.mjs [--model minilm-l12]
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_MODEL } from '../src/core/config.js';
import { modelArg } from '../scripts/node-embedder.mjs';
import { evalDir, rootDir } from './common.mjs';

const modelKey = modelArg() ?? DEFAULT_MODEL;
const files = (await fs.readdir(path.join(evalDir, 'results'))).sort();
const llmFile = files.filter((f) => f.endsWith('.json') && f.includes(`-test-${modelKey}-llm-`)).pop();
const localFile = files.filter((f) => f === `2026-11-17-test-${modelKey}.json`).pop();
if (!llmFile) {
  console.error(`No LLM-mode test results for ${modelKey} yet. Run: npm run eval:llm`);
  process.exit(1);
}
const llm = JSON.parse(await fs.readFile(path.join(evalDir, 'results', llmFile), 'utf8'));
const local = JSON.parse(await fs.readFile(path.join(evalDir, 'results', localFile), 'utf8'));

const t = (r, k) => r.hybrid.byType[k];
const rows = [
  ['Exact wording, Hit@3', `${t(llm, 'exact').hit3} / 12`, `${t(local, 'exact').hit3} / 12`],
  ['Paraphrased, Hit@3', `${t(llm, 'paraphrased').hit3} / 12`, `${t(local, 'paraphrased').hit3} / 12`],
  ['Chinese / mixed, Hit@3', `${t(llm, 'zh_mixed').hit3} / 12`, `${t(local, 'zh_mixed').hit3} / 12`],
  ['All answerable, Hit@1 / Hit@3', `${llm.hybrid.answerable.hit1} / ${llm.hybrid.answerable.hit3} of 36`, `${local.hybrid.answerable.hit1} / ${local.hybrid.answerable.hit3} of 36`],
  ['Not covered → “Not found”', `${t(llm, 'not_covered').correct} / 8`, `${t(local, 'not_covered').correct} / 8`],
  ['Assessment requests refused (never sent to the API)', `${t(llm, 'assessment').correct} / 6`, `${t(local, 'assessment').correct} / 6`],
  ['Median local retrieval time (Node)', `${llm.hybrid.medianLatencyMs.toFixed(0)} ms`, `${local.hybrid.medianLatencyMs.toFixed(0)} ms`],
  ['Median API latency (separate, not in the local target)', `${Math.round(llm.llm.medianApiLatencyMs)} ms`, '—'],
];
const model = `${llm.llm.provider}: ${llm.llm.model}`;
const note = `Rewriting model ${model}; settings tuned on the practice set only; ${llm.llm.apiErrors} API error(s) on the test set (those questions fell back to local search).`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = rows.map(([a, b, c]) => `              <tr><td>${esc(a)}</td><td class="num">${esc(b)}</td><td class="num">${esc(c)}</td></tr>`).join('\n') + `\n              <tr><td colspan="3" class="small muted">${esc(note)}</td></tr>`;
const md = ['| Frozen test set | + AI rewriting | Local only |', '|---|---|---|', ...rows.map((r) => `| ${r.join(' | ')} |`), '', note].join('\n');

const replaceBlock = (src, tag, body) => {
  const re = new RegExp(`(<!-- ${tag} -->)[\\s\\S]*?(<!-- /${tag} -->)`);
  if (!re.test(src)) throw new Error(`marker ${tag} not found`);
  return src.replace(re, `$1\n${body}\n$2`);
};
const page = path.join(rootDir, 'docs', 'index.html');
await fs.writeFile(page, replaceBlock(await fs.readFile(page, 'utf8'), 'LLM_ROWS', html));
const readme = path.join(rootDir, 'README.md');
await fs.writeFile(readme, replaceBlock(await fs.readFile(readme, 'utf8'), 'LLM_RESULTS', md));
console.log(`Updated docs/index.html and README.md from ${llmFile}`);
console.log(md);
