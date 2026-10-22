// Annotation workflow for the two-annotator protocol (proposal Section 3).
// Annotators work independently from the transcripts (eval/transcript.mjs), never from Rewind's output.
//
//   node eval/annotate.mjs record <test|practice> <id> <A|B> <lecture> <start> <end> [<lecture> <start> <end> ...]
//   node eval/annotate.mjs record <test|practice> <id> <A|B> none        (not covered / assessment)
//   node eval/annotate.mjs reconcile <test|practice>                    (auto-agree close pairs; list disagreements)
//   node eval/annotate.mjs agree <test|practice> <id> <lecture> <start> <end> [...]   (record a discussed outcome)
//   node eval/annotate.mjs status <test|practice>
//   node eval/annotate.mjs freeze test                                  (only when every question is verified)
import fs from 'node:fs/promises';
import path from 'node:path';
import { evalDir } from './common.mjs';
import { toSeconds } from '../src/eval/metrics.js';

const [cmd, set, ...rest] = process.argv.slice(2);
if (!cmd || !set) {
  console.log('usage: see header of eval/annotate.mjs');
  process.exit(1);
}
const file = path.join(evalDir, `questions.${set}.json`);
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const save = () => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
const find = (id) => {
  const q = data.questions.find((x) => x.id === id);
  if (!q) throw new Error(`No question ${id} in ${set}`);
  return q;
};
const parseIntervals = (args) => {
  if (args[0] === 'none') return [];
  if (args.length % 3) throw new Error('intervals are triples: <lecture> <start mm:ss> <end mm:ss>');
  const out = [];
  for (let i = 0; i < args.length; i += 3) {
    const iv = { lecture: Number(args[i]), start: args[i + 1], end: args[i + 2] };
    if (toSeconds(iv.end) <= toSeconds(iv.start)) throw new Error(`end before start: ${args.slice(i, i + 3).join(' ')}`);
    out.push(iv);
  }
  return out;
};
const guardFrozen = () => {
  if (data.frozen) throw new Error(`${set} set is frozen; unfreeze deliberately (edit the file) if you must change it.`);
};

// Two annotations agree when they cover the same lectures and each pair of starts is within 30 s
// and overlaps. The agreed interval is the stricter intersection.
function agreement(a, b) {
  if (a.length !== b.length) return null;
  if (!a.length) return [];
  const out = [];
  for (const x of a) {
    const y = b.find((z) => z.lecture === x.lecture && Math.abs(toSeconds(z.start) - toSeconds(x.start)) <= 30);
    if (!y) return null;
    const s = Math.max(toSeconds(x.start), toSeconds(y.start));
    const e = Math.min(toSeconds(x.end), toSeconds(y.end));
    if (e <= s) return null;
    out.push({ lecture: x.lecture, start: toSeconds(x.start) >= toSeconds(y.start) ? x.start : y.start, end: toSeconds(x.end) <= toSeconds(y.end) ? x.end : y.end });
  }
  return out;
}

if (cmd === 'record') {
  guardFrozen();
  const [id, who, ...ivs] = rest;
  if (!['A', 'B'].includes(who)) throw new Error('annotator must be A or B');
  const q = find(id);
  q[`annotator${who}`] = { intervals: parseIntervals(ivs), at: new Date().toISOString() };
  q.status = 'unverified';
  await save();
  console.log(`${id}: recorded annotator ${who}`);
} else if (cmd === 'reconcile') {
  guardFrozen();
  let agreed = 0;
  const disputes = [];
  for (const q of data.questions) {
    if (!q.annotatorA || !q.annotatorB) continue;
    const a = agreement(q.annotatorA.intervals, q.annotatorB.intervals);
    if (a) {
      q.intervals = a;
      q.status = 'verified';
      agreed++;
    } else {
      q.status = 'disputed';
      disputes.push(q);
    }
  }
  await save();
  console.log(`${agreed} agreed and marked verified.`);
  for (const q of disputes) console.log(`DISPUTED ${q.id} "${q.query}"\n   A: ${JSON.stringify(q.annotatorA.intervals)}\n   B: ${JSON.stringify(q.annotatorB.intervals)}\n   -> discuss, then: node eval/annotate.mjs agree ${set} ${q.id} <lecture> <start> <end>`);
} else if (cmd === 'agree') {
  guardFrozen();
  const [id, ...ivs] = rest;
  const q = find(id);
  if (!q.annotatorA || !q.annotatorB) throw new Error(`${id} needs both annotations before reconciliation`);
  q.intervals = parseIntervals(ivs);
  q.status = 'verified';
  q.reconciledAt = new Date().toISOString();
  await save();
  console.log(`${id}: reconciled and verified`);
} else if (cmd === 'status') {
  const by = {};
  for (const q of data.questions) by[q.status] = (by[q.status] ?? 0) + 1;
  const missing = data.questions.filter((q) => !q.annotatorA || !q.annotatorB).map((q) => q.id);
  console.log(`${set}: ${data.questions.length} questions, ${JSON.stringify(by)}, frozen=${!!data.frozen}`);
  if (missing.length) console.log(`Missing an annotation: ${missing.join(', ')}`);
} else if (cmd === 'freeze') {
  const notVerified = data.questions.filter((q) => q.status !== 'verified');
  if (notVerified.length) throw new Error(`Cannot freeze: ${notVerified.length} questions not verified (${notVerified.map((q) => q.id).join(', ')})`);
  data.frozen = true;
  data.frozenAt = new Date().toISOString();
  await save();
  console.log(`${set} set frozen.`);
} else {
  console.log(`unknown command ${cmd}`);
  process.exit(1);
}
