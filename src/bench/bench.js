// In-browser benchmark: same evaluation code as eval/run-eval.mjs, run in the extension runtime.
import { prepareQuestions, runQuestions, summarize, checkTargets, ANSWERABLE } from '../eval/metrics.js';
import { configFor, DEFAULT_MODEL } from '../core/config.js';
import { createEmbedClient } from '../embed/client.js';
import { loadDemo } from '../adapters/demo.js';

const $ = (id) => document.getElementById(id);

$('run').addEventListener('click', async () => {
  $('run').disabled = true;
  const out = $('out');
  out.replaceChildren();
  try {
    const { model = DEFAULT_MODEL } = await chrome.storage.local.get('model');
    const set = $('set').value;
    $('status').textContent = `Loading demo index (${model})…`;
    const index = await loadDemo(model, chrome.runtime.getURL('demo/'));
    const qfile = await (await fetch(chrome.runtime.getURL(`bench/questions.${set}.json`))).json();
    const questions = prepareQuestions(qfile, index);

    const embed = createEmbedClient(chrome.runtime.getURL('worker.js'));
    $('status').textContent = 'Loading model from the browser cache…';
    let t = performance.now();
    const st = await embed.load(model, { allowDownload: false });
    const modelLoadMs = performance.now() - t;
    if (st.status !== 'ready') throw new Error(`Model not available (${st.error}). Download it once in the side panel's Setup tab.`);
    for (const w of ['warm up', '预热', 'master theorem']) await embed.embedQuery(w);

    const config = configFor(model);
    $('status').textContent = 'Running hybrid retrieval…';
    const hybridRecords = await runQuestions(index, questions, { embedQuery: (q) => embed.embedQuery(q), config });
    $('status').textContent = 'Running keyword baseline…';
    const baselineRecords = await runQuestions(index, questions, { config, keywordOnly: true });
    const hybrid = summarize(hybridRecords);
    const baseline = summarize(baselineRecords);
    const unverified = questions.filter((q) => q.status !== 'verified').length;

    const report = {
      generatedAt: new Date().toISOString(),
      runtime: 'browser',
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGB: navigator.deviceMemory ?? null,
      set,
      model,
      provisional: unverified > 0 || (set === 'test' && !qfile.frozen),
      modelLoadMs: Math.round(modelLoadMs),
      corpus: { videos: index.videos.length, windows: index.windows.length },
      hybrid,
      baseline,
      targets: set === 'test' ? checkTargets(hybrid, baseline) : [],
      records: { hybrid: hybridRecords, baseline: baselineRecords },
    };

    const table = document.createElement('table');
    const row = (cells, th = false) => {
      const tr = document.createElement('tr');
      for (const c of cells) {
        const cell = document.createElement(th ? 'th' : 'td');
        cell.textContent = c;
        tr.append(cell);
      }
      table.append(tr);
    };
    row(['Type', 'N', 'Hybrid Hit@1', 'Hybrid Hit@3', 'Keyword Hit@1', 'Keyword Hit@3'], true);
    for (const ty of ANSWERABLE) row([ty, hybrid.byType[ty].n, hybrid.byType[ty].hit1, hybrid.byType[ty].hit3, baseline.byType[ty].hit1, baseline.byType[ty].hit3]);
    row(['not found (correct)', hybrid.byType.not_covered.n, hybrid.byType.not_covered.correct, '', baseline.byType.not_covered.correct, '']);
    row(['refusals', hybrid.byType.assessment.n, hybrid.byType.assessment.correct, '', '', '']);
    const p = document.createElement('p');
    p.textContent = `${report.provisional ? 'PROVISIONAL (unverified annotations). ' : ''}Median local retrieval latency: ${hybrid.medianLatencyMs.toFixed(1)} ms · model load from cache: ${report.modelLoadMs} ms · ${navigator.hardwareConcurrency} logical cores.`;
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify({ ...report, records: undefined }, null, 2);
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    dl.download = `rewind-browser-bench-${set}-${model}.json`;
    dl.textContent = 'Download full report (JSON)';
    out.append(p, table, dl, pre);
    $('status').textContent = 'Done.';
    globalThis.__benchReport = report;
  } catch (err) {
    $('status').textContent = `Benchmark failed: ${err.message}`;
  } finally {
    $('run').disabled = false;
  }
});
