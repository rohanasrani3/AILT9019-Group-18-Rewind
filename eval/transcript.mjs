// Transcript lookup for annotators. Searches the RAW caption files (not Rewind's ranking), so
// annotations stay independent of the system being evaluated.
//   node eval/transcript.mjs grep <lecture|all> <regex>
//   node eval/transcript.mjs show <lecture> <from mm:ss> <to mm:ss>
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCaptions } from '../src/core/captions.js';
import { formatTime } from '../src/core/links.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(here, '..', 'demo', 'raw');
const toSec = (s) => s.split(':').reduce((a, x) => a * 60 + Number(x), 0);

async function cues(n) {
  return parseCaptions(await fs.readFile(path.join(rawDir, `lecture-${String(n).padStart(2, '0')}.vtt`), 'utf8'));
}

const [cmd, lec, a, b] = process.argv.slice(2);
if (cmd === 'grep') {
  const re = new RegExp(a, 'i');
  const lectures = lec === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [Number(lec)];
  for (const n of lectures) {
    const cs = await cues(n);
    cs.forEach((c, i) => {
      const ctx = [cs[i - 1]?.text, c.text, cs[i + 1]?.text].filter(Boolean).join(' / ');
      if (re.test(c.text)) console.log(`L${n} ${formatTime(c.start).padStart(7)}  ${ctx}`);
    });
  }
} else if (cmd === 'show') {
  const from = toSec(a);
  const to = toSec(b);
  for (const c of await cues(Number(lec))) if (c.start >= from && c.start <= to) console.log(`${formatTime(c.start).padStart(7)}  ${c.text}`);
} else {
  console.log('usage: transcript.mjs grep <lecture|all> <regex> | show <lecture> <from> <to>');
}
