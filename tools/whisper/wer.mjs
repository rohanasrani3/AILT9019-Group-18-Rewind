// Word error rate of a machine transcript against reference captions over the same time span.
//   node tools/whisper/wer.mjs <hypothesis.vtt> <reference.vtt> [--from 0] [--to 600] [--out eval/results/whisper-wer.json]
// Normalisation: lowercase, punctuation removed, digits kept, "--" and filler marks dropped.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCaptions } from '../../src/core/captions.js';

export function normalise(text) {
  return String(text)
    .toLowerCase()
    .replace(/\[[^\]]*\]|\((?:laughter|applause|inaudible|music|pause|crosstalk|silence)[^)]*\)/gi, ' ') // [inaudible], (laughter); keeps maths like T(n)
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/'(?![a-z])/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Levenshtein distance over words, with substitution/deletion/insertion counts.
export function wer(refWords, hypWords) {
  const n = refWords.length;
  const m = hypWords.length;
  let prev = Array.from({ length: m + 1 }, (_, j) => ({ d: j, s: 0, del: 0, ins: j }));
  for (let i = 1; i <= n; i++) {
    const cur = [{ d: i, s: 0, del: i, ins: 0 }];
    for (let j = 1; j <= m; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        cur.push({ ...prev[j - 1] });
        continue;
      }
      const sub = prev[j - 1];
      const del = prev[j];
      const ins = cur[j - 1];
      const best = Math.min(sub.d, del.d, ins.d);
      if (best === sub.d) cur.push({ d: sub.d + 1, s: sub.s + 1, del: sub.del, ins: sub.ins });
      else if (best === del.d) cur.push({ d: del.d + 1, s: del.s, del: del.del + 1, ins: del.ins });
      else cur.push({ d: ins.d + 1, s: ins.s, del: ins.del, ins: ins.ins + 1 });
    }
    prev = cur;
  }
  const r = prev[m];
  return { wer: n ? r.d / n : 0, substitutions: r.s, deletions: r.del, insertions: r.ins, refWords: n, hypWords: m };
}

const inSpan = (cues, from, to) => cues.filter((c) => c.start >= from && c.start < to).map((c) => c.text).join(' ');

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, d) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : d);
  const [hypFile, refFile] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  const from = Number(opt('from', 0));
  const to = Number(opt('to', 600));
  const hyp = parseCaptions(await fs.readFile(hypFile, 'utf8'));
  const ref = parseCaptions(await fs.readFile(refFile, 'utf8'));
  const r = wer(normalise(inSpan(ref, from, to)), normalise(inSpan(hyp, from, to)));
  const report = { hypothesis: path.basename(hypFile), reference: path.basename(refFile), span: { from, to }, ...r, wer: +r.wer.toFixed(4), note: 'Reference = MIT OCW published captions (themselves human-edited, not a verbatim transcript), so WER overstates true error somewhat.' };
  const out = opt('out');
  if (out) {
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify(report, null, 2));
  }
  console.log(`WER ${(report.wer * 100).toFixed(1)}% over ${r.refWords} reference words (${from}–${to} s): ${r.substitutions} substitutions, ${r.deletions} deletions, ${r.insertions} insertions.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => (console.error(e.message), process.exit(1)));
