// Command-line search over an exported Rewind index, for the rewind-search agent skill.
// Bundled into ../scripts/search.mjs (no npm install needed for keyword search).
//   node scripts/search.mjs --index <course.rewind.json> [--json] [--keyword-only] "<question>"
import fs from 'node:fs/promises';
import { importIndex } from '../../../src/core/exchange.js';
import { search } from '../../../src/core/search.js';
import { configFor } from '../../../src/core/config.js';
import { MODELS, createEmbedder } from '../../../src/embed/embedder.js';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : null);
const valued = new Set(['--index']);
const question = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1])).join(' ').trim();

async function tryEmbedder(index) {
  if (flag('keyword-only') || !index.vectors || !MODELS[index.model?.key]) return null;
  try {
    const transformers = await import('@huggingface/transformers');
    const e = createEmbedder(transformers, { model: index.model.key });
    await e.load();
    return e;
  } catch {
    return null; // Transformers.js not installed or model not downloadable: keyword search only.
  }
}

async function main() {
  const file = opt('index');
  if (!file || !question) {
    console.error('usage: node scripts/search.mjs --index <course.rewind.json> [--json] [--keyword-only] "<question>"');
    process.exit(2);
  }
  const index = importIndex(JSON.parse(await fs.readFile(file, 'utf8')));
  const emb = await tryEmbedder(index);
  const r = await search(index, question, { embedQuery: emb?.embedQuery ?? null, keywordOnly: !emb, config: configFor(index.model?.key) });

  if (flag('json')) {
    console.log(JSON.stringify({ status: r.status, keywordOnly: !!r.keywordOnly, notice: r.notice ?? null, results: r.results, related: r.related ?? [], coverage: r.coverage }, null, 2));
    return;
  }
  const show = (x, i) => `${i + 1}. ${x.title} — ${x.time} (${x.strength}${x.machineTranscribed ? '; machine-transcribed, not verified' : ''})\n   ${x.url}\n   "${x.excerpt}"`;
  console.log(`Course: ${index.title} (${r.coverage.indexed} of ${r.coverage.total} videos indexed)${r.keywordOnly ? ' [keyword-only search]' : ''}`);
  if (r.status === 'results') console.log(r.results.map(show).join('\n'));
  else if (r.status === 'not_found') console.log("NOT FOUND in this course's indexed captions.");
  else if (r.status === 'no_index') console.log('INDEX UNAVAILABLE: no video in this course has captions.');
  else if (r.status === 'refused') {
    console.log(`REFUSED: ${r.notice}`);
    if (r.related?.length) console.log(`Where the topic was explained (no solutions):\n${r.related.map(show).join('\n')}`);
  } else console.log('Empty question.');
}

main().catch((e) => {
  console.error(`rewind-search: ${e.message}`);
  process.exit(1);
});
