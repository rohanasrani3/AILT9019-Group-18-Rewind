// Rewind side panel: search, course management and setup.
// Caption text is untrusted data: it is only ever inserted with textContent, never as HTML.
import { search } from '../core/search.js';
import { buildCourseIndex } from '../core/indexer.js';
import { configFor, DEFAULT_MODEL } from '../core/config.js';
import { formatTime } from '../core/links.js';
import { MODELS } from '../embed/embedder.js';
import { createEmbedClient } from '../embed/client.js';
import { createStore } from '../storage/db.js';
import { loadDemo, DEMO_COURSE_ID } from '../adapters/demo.js';
import { parsePanoptoUrl, collectFolder, fetchSessionCaptions, PANOPTO_HOSTS, STATUS_TEXT } from '../adapters/panopto.js';
import { exportIndex, importIndex, exportFileName } from '../core/exchange.js';
import { buildTimeline } from '../core/timeline.js';
import { createLLM, PROVIDERS, requestBody, rewritePayload, labelPayload } from '../llm/client.js';
import { filterExcerpts } from '../llm/sensitive.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};

const store = createStore();
const LLM_DEFAULTS = { provider: 'openrouter', model: PROVIDERS.openrouter.defaultModel, rewrite: false, labels: false };
const settings = { model: DEFAULT_MODEL, activeCourseId: null, modelInstalled: {}, llm: { ...LLM_DEFAULTS }, externalOk: {} };
let current = null; // { id, index }
let indexing = null; // AbortController while indexing

const embed = createEmbedClient(chrome.runtime.getURL('worker.js'), { onState: renderModelState });

// ---------- settings ----------
async function loadSettings() {
  const s = await chrome.storage.local.get(['model', 'activeCourseId', 'modelInstalled', 'llm', 'externalOk']);
  if (s.model && MODELS[s.model]) settings.model = s.model;
  settings.activeCourseId = s.activeCourseId ?? null;
  settings.modelInstalled = s.modelInstalled ?? {};
  settings.llm = { ...LLM_DEFAULTS, ...(s.llm ?? {}) };
  settings.externalOk = s.externalOk ?? {};
}
const saveSettings = () => chrome.storage.local.set({ ...settings });

// ---------- tabs ----------
const tabs = ['search', 'courses', 'setup'];
function showTab(name, focus = false) {
  for (const t of tabs) {
    const tab = $(`tab-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`panel-${t}`).hidden = !on;
    if (on && focus) tab.focus();
  }
  if (name === 'setup') renderStorage();
}
for (const t of tabs) {
  $(`tab-${t}`).addEventListener('click', () => showTab(t));
  $(`tab-${t}`).addEventListener('keydown', (e) => {
    const i = tabs.indexOf(t);
    const next = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, Home: 0, End: 2 }[e.key];
    if (next != null) {
      e.preventDefault();
      showTab(tabs[next], true);
    }
  });
}

// ---------- model ----------
function renderModelState(s) {
  const name = MODELS[s.model ?? settings.model]?.id ?? '';
  const text = {
    idle: settings.modelInstalled[settings.model] ? 'Model downloaded, not loaded yet.' : 'Model not downloaded. Keyword search works without it.',
    loading: `Loading ${name} from this device…`,
    downloading: `Downloading ${name}${s.progress != null ? ` — ${s.progress}%` : '…'} (one time, about 120 MB)`,
    ready: `Ready: ${name} runs locally on this device.`,
    failed: `Model unavailable: ${s.error ?? 'unknown error'}. Keyword search still works.`,
  }[s.status];
  $('model-status').textContent = text;
  $('download-model').disabled = s.status === 'downloading' || s.status === 'loading';
  $('download-model').textContent = s.status === 'ready' ? 'Check model again' : 'Download & check model';
}

async function waitForModel(ms = 20000) {
  const st = embed.state.status;
  if (st !== 'loading' && st !== 'downloading') return;
  const t0 = Date.now();
  while (['loading', 'downloading'].includes(embed.state.status) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 150));
}

function startModelIfInstalled() {
  if (settings.modelInstalled[settings.model]) {
    embed.load(settings.model, { allowDownload: false }).then((s) => {
      if (s.status === 'failed') {
        // Cache was cleared or is unusable: say so instead of silently downloading.
        settings.modelInstalled[settings.model] = false;
        saveSettings();
      }
    });
  }
}

$('download-model').addEventListener('click', async () => {
  const s = await embed.load(settings.model, { allowDownload: true });
  settings.modelInstalled[settings.model] = s.status === 'ready';
  await saveSettings();
  renderModelState(embed.state);
});

$('remove-model').addEventListener('click', async () => {
  embed.reset();
  try {
    for (const k of await caches.keys()) if (k.includes('transformers')) await caches.delete(k);
  } catch {}
  settings.modelInstalled = {};
  await saveSettings();
  $('model-status').textContent = 'Downloaded model removed. Keyword search still works.';
});

$('model-select').addEventListener('change', async (e) => {
  settings.model = e.target.value;
  await saveSettings();
  embed.reset();
  startModelIfInstalled();
  renderModelState(embed.state);
  if (current?.id === DEMO_COURSE_ID) await selectCourse(DEMO_COURSE_ID);
});

// ---------- courses ----------
async function selectCourse(id) {
  try {
    const index = id === DEMO_COURSE_ID ? await loadDemo(settings.model, chrome.runtime.getURL('demo/')) : await store.load(id);
    if (!index) throw new Error('This course index is missing. It may have been deleted.');
    current = { id, index };
    settings.activeCourseId = id;
    await saveSettings();
    const c = coverageText(index);
    $('course-label').textContent = `${index.title} · ${c}`;
    clearResults();
    renderTimeline();
    await renderCourses();
  } catch (err) {
    $('course-label').textContent = `Could not open course: ${err.message}`;
  }
}

function coverageText(index) {
  const total = index.videos.length;
  const ok = index.videos.filter((v) => v.captionStatus === 'indexed').length;
  return `${ok} of ${total} videos indexed`;
}

async function renderCourses() {
  const list = $('course-list');
  list.replaceChildren();
  const courses = await store.list();
  const demoItem = el(
    'li',
    { class: `course${current?.id === DEMO_COURSE_ID ? ' active' : ''}` },
    el('div', { class: 'name', text: 'Demo: MIT 6.046J Introduction to Algorithms (Fall 2005)' }),
    el('div', { class: 'fine', text: '10 lectures · built in · CC BY-NC-SA 4.0 · ' }, el('a', { href: 'https://ocw.mit.edu/courses/6-046j-introduction-to-algorithms-sma-5503-fall-2005/', target: '_blank', rel: 'noopener', text: 'source' })),
    el(
      'div',
      { class: 'button-row' },
      el('button', { class: 'secondary', onclick: () => selectAndSearch(DEMO_COURSE_ID), text: current?.id === DEMO_COURSE_ID ? 'Selected' : 'Search this course', disabled: current?.id === DEMO_COURSE_ID }),
      el('button', { class: 'secondary', onclick: () => exportCourse(DEMO_COURSE_ID), text: 'Export' })
    )
  );
  list.append(demoItem);
  for (const m of courses) {
    const active = current?.id === m.courseId;
    const del = el('button', { class: 'danger', text: 'Delete' });
    del.addEventListener('click', () => confirmThen(del, 'Confirm delete', async () => {
      await store.remove(m.courseId);
      if (current?.id === m.courseId) await selectCourse(DEMO_COURSE_ID);
      else await renderCourses();
      $('index-status').textContent = `Deleted “${m.title}”: its captions, vectors and metadata were removed from this device.`;
    }));
    list.append(
      el(
        'li',
        { class: `course${active ? ' active' : ''}` },
        el('div', { class: 'name', text: m.title }),
        el('div', { class: 'fine', text: `${m.coverage.indexed} of ${m.coverage.total} videos indexed · ${m.model ? `model ${m.model.key}` : 'keyword only'} · ${new Date(m.builtAt).toLocaleDateString()}` }),
        el(
          'div',
          { class: 'button-row' },
          el('button', { class: 'secondary', onclick: () => selectAndSearch(m.courseId), text: active ? 'Selected' : 'Search this course', disabled: active }),
          m.source === 'panopto' ? el('button', { class: 'secondary', onclick: () => reindex(m), text: 'Reindex' }) : null,
          el('button', { class: 'secondary', onclick: () => exportCourse(m.courseId), text: 'Export' }),
          del
        ),
        m.source === 'panopto'
          ? el(
              'label',
              { class: 'check fine' },
              el('input', {
                type: 'checkbox',
                checked: !!settings.externalOk[m.courseId],
                onchange: async (e) => {
                  settings.externalOk[m.courseId] = e.target.checked;
                  await saveSettings();
                },
              }),
              'External processing permitted for this course (allows AI labels on its excerpts; ask your lecturer first)'
            )
          : null
      )
    );
  }
}

async function selectAndSearch(id) {
  await selectCourse(id);
  showTab('search');
  $('q').focus();
}

// Two-step confirmation without blocking browser dialogs.
function confirmThen(button, label, action) {
  if (button.dataset.armed) {
    delete button.dataset.armed;
    action();
    return;
  }
  const original = button.textContent;
  button.dataset.armed = '1';
  button.textContent = label;
  setTimeout(() => {
    if (button.dataset.armed) {
      delete button.dataset.armed;
      button.textContent = original;
    }
  }, 5000);
}

$('use-demo').addEventListener('click', () => selectAndSearch(DEMO_COURSE_ID));

// ---------- export / import ----------
async function exportCourse(id) {
  try {
    const index = id === current?.id ? current.index : id === DEMO_COURSE_ID ? await loadDemo(settings.model, chrome.runtime.getURL('demo/')) : await store.load(id);
    const file = exportIndex(index);
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = el('a', { href: url, download: exportFileName(index) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('import-status').textContent =
      index.source === 'panopto' ? `Exported “${index.title}”. It contains caption text from a restricted course: do not share it.` : `Exported “${index.title}”.`;
  } catch (err) {
    $('import-status').textContent = `Export failed: ${err.message}`;
  }
}

$('import-file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    if (f.size > 200 * 2 ** 20) throw new Error('File is larger than 200 MB.');
    const index = importIndex(JSON.parse(await f.text()));
    if (index.courseId === DEMO_COURSE_ID) index.courseId = `import:${DEMO_COURSE_ID}`;
    await store.save(index);
    $('import-status').textContent = `Imported “${index.title}” (${coverageText(index)}).`;
    await selectCourse(index.courseId);
  } catch (err) {
    $('import-status').textContent = `Import failed: ${err.message}`;
  }
});

// ---------- concept timeline ----------
let timeline = null;
function renderTimeline() {
  timeline = current ? buildTimeline(current.index) : [];
  const sel = $('timeline-video');
  sel.replaceChildren(...timeline.filter((t) => t.segments.length).map((t) => el('option', { value: String(t.videoIndex), text: t.title })));
  renderTimelineList();
}

function renderTimelineList() {
  const vi = Number($('timeline-video').value);
  const t = timeline?.find((x) => x.videoIndex === vi);
  $('timeline-list').replaceChildren(
    ...(t?.segments ?? []).map((s) =>
      el(
        'li',
        {},
        el(
          'a',
          { href: s.url, target: '_blank', rel: 'noopener', 'aria-label': `${s.time}: ${s.terms.join(', ') || 'no distinctive terms'}` },
          el('span', { class: 't', text: s.time }),
          el('span', { class: s.terms.length ? '' : 'none', text: s.terms.join(', ') || 'no distinctive terms' })
        )
      )
    )
  );
}
$('timeline-video').addEventListener('change', renderTimelineList);

// ---------- Panopto indexing ----------
function pageFetchIn(tabId) {
  return async (url, init = {}) => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (u, i) => {
        try {
          const r = await fetch(u, { ...i, credentials: 'include' });
          return { status: r.status, text: await r.text() };
        } catch (e) {
          return { status: 0, text: String(e) };
        }
      },
      args: [url, init],
    });
    if (!res) throw new Error('Could not run in the Panopto tab');
    return res.result;
  };
}

$('index-course').addEventListener('click', () => {
  // permissions.request must be called directly in the click handler.
  chrome.permissions.request({ origins: PANOPTO_HOSTS }).then(
    async (ok) => {
      if (!ok) {
        $('index-status').textContent = 'Permission was not granted, so Rewind cannot read this Panopto folder. Nothing was indexed.';
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const p = tab?.url ? parsePanoptoUrl(tab.url) : null;
      if (!p) return void ($('index-status').textContent = 'The current tab is not a Panopto page. Open your course folder in Panopto, then click Index this course again.');
      if (p.kind !== 'folder') return void ($('index-status').textContent = 'Open the Panopto folder view (the list of recordings), not a single video or the home page, then try again.');
      await runIndexing(tab.id, p.origin, p.folderId);
    },
    (err) => ($('index-status').textContent = `Permission request failed: ${err.message}`)
  );
});

async function reindex(meta) {
  if (meta.source !== 'panopto') return;
  const ok = await chrome.permissions.contains({ origins: [`${meta.origin}/*`] });
  const tabs = ok ? await chrome.tabs.query({ url: `${meta.origin}/*` }) : [];
  if (!tabs.length) {
    showTab('courses');
    $('index-status').textContent = `To reindex, open ${meta.origin} in a tab (signed in), then click Reindex again.`;
    return;
  }
  await runIndexing(tabs[0].id, meta.origin, meta.folderId);
}

$('cancel-index').addEventListener('click', () => indexing?.abort());

async function runIndexing(tabId, origin, folderId) {
  showTab('courses');
  const status = $('index-status');
  const bar = $('index-progress');
  indexing = new AbortController();
  $('index-course').disabled = true;
  $('cancel-index').hidden = false;
  bar.hidden = false;
  bar.value = 0;
  try {
    await waitForModel();
    if (embed.state.status !== 'ready' && settings.modelInstalled[settings.model]) await embed.load(settings.model);
    const useModel = embed.state.status === 'ready' && embed.state.model === settings.model;
    status.textContent = 'Listing recordings in this folder…';
    const { meta, videos } = await collectFolder(pageFetchIn(tabId), {
      origin,
      folderId,
      signal: indexing.signal,
      onProgress: ({ done, total, title }) => {
        bar.value = Math.round((done / total) * (useModel ? 40 : 90));
        status.textContent = `Reading captions ${done}/${total}: ${title}`;
      },
    });
    if (!videos.length) {
      status.textContent = 'This folder has no recordings that you can access. Nothing was indexed.';
      return;
    }
    const profile = MODELS[settings.model];
    const index = await buildCourseIndex(
      { ...meta, model: useModel ? { key: profile.key, id: profile.id, revision: profile.revision, dtype: profile.dtype } : null },
      videos,
      {
        embedPassages: useModel ? (texts) => embed.embedPassages(texts) : undefined,
        dim: profile.dim,
        config: configFor(settings.model),
        onProgress: ({ done, total }) => {
          if (indexing.signal.aborted) throw new Error('Indexing cancelled.');
          bar.value = 40 + Math.round((done / total) * 58);
          status.textContent = `Building local search index ${done}/${total} passages…`;
        },
      }
    );
    await store.save(index);
    bar.value = 100;
    const ok = index.videos.filter((v) => v.captionStatus === 'indexed').length;
    status.textContent =
      ok === 0
        ? `Index unavailable: none of the ${index.videos.length} videos in “${index.title}” have captions, so there is nothing to search.`
        : `Indexed ${ok} of ${index.videos.length} videos in “${index.title}”.${useModel ? '' : ' The local model is not set up, so this index supports keyword search only. Set up the model in Setup and reindex for paraphrased and Chinese questions.'}`;
    renderExcluded(index);
    await selectCourse(index.courseId);
  } catch (err) {
    status.textContent = err.code === 'cancelled' || /cancelled/i.test(err.message) ? 'Indexing cancelled. Nothing was saved.' : `Indexing failed: ${err.message}`;
  } finally {
    indexing = null;
    $('index-course').disabled = false;
    $('cancel-index').hidden = true;
    bar.hidden = true;
  }
}

function renderExcluded(index) {
  const ex = index.videos.filter((v) => v.captionStatus !== 'indexed');
  $('excluded').hidden = !ex.length;
  $('excluded-summary').textContent = `${ex.length} video${ex.length === 1 ? '' : 's'} not indexed`;
  $('excluded-list').replaceChildren(...ex.map((v) => el('li', { text: `${v.title} — ${STATUS_TEXT[v.captionStatus] ?? v.captionStatus}` })));
}

// ---------- search ----------
function clearResults() {
  $('results').replaceChildren();
  $('related-list').replaceChildren();
  $('related').hidden = true;
  $('search-status').textContent = '';
  $('coverage-line').textContent = '';
  $('banner').hidden = true;
}

function keywordOnlyReason(index) {
  if (!index.vectors) return 'This course was indexed without the local model, so only keyword search is available. Set up the model in Setup, then reindex the course for paraphrased and Chinese questions.';
  if (index.model?.key && index.model.key !== settings.model) return `This course was indexed with a different model (${index.model.key}). Reindex it, or switch the model in Setup, to use paraphrased and Chinese search.`;
  const s = embed.state;
  if (s.status === 'failed') return `Keyword-only mode: the local model could not run (${s.error}). Paraphrased and Chinese questions may be missed.`;
  return 'Keyword-only mode: the local model is not set up yet, so paraphrased and Chinese questions may be missed. Download it once in Setup.';
}

$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('q').value;
  if (!current) {
    $('search-status').textContent = 'Choose a course first (Courses tab), or use the demo course.';
    return;
  }
  clearResults();
  $('search-btn').disabled = true;
  $('search-status').textContent = 'Searching…';
  try {
    await waitForModel();
    const index = current.index;
    const modelMatches = index.vectors && index.model?.key === settings.model && embed.state.status === 'ready' && embed.state.model === settings.model;
    const llm = await activeLLM();
    const useRewrite = !!(llm && settings.llm.rewrite);
    const r = await search(index, q, {
      embedQuery: modelMatches ? (t) => embed.embedQuery(t) : null,
      keywordOnly: !modelMatches,
      config: configFor(index.model?.key ?? settings.model, { llm: useRewrite }),
      rewrite: useRewrite ? async (question) => (await llm.rewriteQuery(question)).queries : null,
    });
    render(r, modelMatches, llm);
    updatePreview(r);
    if (llm && settings.llm.labels && r.status === 'results' && labelsAllowed(index)) addLabels(llm, r.results);
  } catch (err) {
    $('search-status').textContent = `Search failed: ${err.message}`;
  } finally {
    $('search-btn').disabled = false;
  }
});

function render(r, modelMatches, llm) {
  const status = $('search-status');
  document.querySelector('.llm-note')?.remove();
  if (r.llm) {
    const text = r.llm.error
      ? `AI query help was unavailable (${r.llm.error}); these are local results only.`
      : r.rewrites?.length
        ? `Also searched for: ${r.rewrites.join(' · ')} (suggested by ${llm?.model ?? 'the AI model'}; your original question was searched too).`
        : null;
    if (text) status.after(el('p', { class: 'llm-note', role: 'note', text }));
  }
  const banner = $('banner');
  if (r.keywordOnly && r.status !== 'empty' && r.status !== 'no_index') {
    banner.hidden = false;
    banner.className = 'banner';
    banner.textContent = r.degraded ? 'The local model failed on this question, so these are keyword results only.' : keywordOnlyReason(current.index);
  }
  const cov = r.coverage;
  const excluded = cov.total - cov.indexed;
  if (cov.total) $('coverage-line').textContent = `Searched captions of ${cov.indexed} of ${cov.total} videos${excluded ? ` (${excluded} not indexed — see Courses)` : ''}.`;

  if (r.status === 'empty') status.textContent = 'Type a question first.';
  else if (r.status === 'no_index')
    status.textContent = 'Index unavailable: none of the videos in this course have captions, so there is nothing to search. This is different from “not found”.';
  else if (r.status === 'not_found') status.textContent = 'Not found in this course’s indexed recordings. Try other words, or check the videos that were not indexed.';
  else if (r.status === 'refused') {
    status.replaceChildren(el('p', { class: 'notice', text: r.notice }));
    if (r.related?.length) {
      $('related').hidden = false;
      $('related-list').replaceChildren(...r.related.map((x, i) => resultItem(x, i)));
    }
  } else {
    status.textContent = `${r.results.length} moment${r.results.length === 1 ? '' : 's'} found. Check each one in the video: captions can be wrong.`;
    $('results').replaceChildren(...r.results.map((x, i) => resultItem(x, i)));
  }
}

function resultItem(x, i) {
  const video = current.index.videos[x.videoIndex];
  const link = el('a', { class: 'open', href: x.url, target: '_blank', rel: 'noopener', text: `Open at ${x.time}`, 'aria-label': `Open ${x.title} at ${x.time}` });
  if (video.kind === 'panopto') link.addEventListener('click', (e) => openPanopto(e, video, x));
  return el(
    'li',
    { class: 'result' },
    el('h3', { text: x.title }),
    el(
      'p',
      { class: 'meta' },
      el('span', { class: 'time', text: x.time }),
      ' · ',
      el('span', { class: `strength${x.strength === 'Strong match' ? ' strong' : ''}`, text: x.strength }),
      i === 0 ? ' · best match' : ''
    ),
    x.machineTranscribed ? el('p', {}, el('span', { class: 'badge', text: 'Machine-transcribed; not verified' })) : null,
    el('p', { class: 'ai-label', hidden: true }),
    el('p', { class: 'excerpt', text: `“${x.excerpt}”` }),
    link
  );
}

// ---------- optional AI query help ----------
// The key lives in chrome.storage.session: not on disk, cleared when the browser closes, and not
// readable by web pages. Requests go from the extension, never from the Panopto page.
async function getKey() {
  return (await chrome.storage.session.get('llmKey')).llmKey ?? null;
}

async function activeLLM() {
  const { provider, model, rewrite, labels } = settings.llm;
  if (!rewrite && !labels) return null;
  const key = await getKey();
  if (!key) return null;
  if (!(await chrome.permissions.contains({ origins: [PROVIDERS[provider].hostPermission] }))) return null;
  return createLLM({ provider, model, apiKey: key });
}

function labelsAllowed(index) {
  return index.source !== 'panopto' || !!settings.externalOk[index.courseId];
}

async function addLabels(llm, results) {
  const { send } = filterExcerpts(results.map((x) => x.excerpt));
  if (!send.length) return;
  try {
    const { labels } = await llm.labelExcerpts(send.map((s) => s.text));
    const nodes = document.querySelectorAll('#results li.result .ai-label');
    send.forEach((s, k) => {
      if (nodes[s.i] && labels[k]) {
        nodes[s.i].textContent = labels[k];
        nodes[s.i].hidden = false;
      }
    });
  } catch {
    // Labels are decoration only; the local results are already shown.
  }
}

// Shows exactly what would be sent for the last question (minus the key).
function updatePreview(r) {
  const { provider, model } = settings.llm;
  const m = model || PROVIDERS[provider].defaultModel;
  const parts = [`POST ${PROVIDERS[provider].url}`, 'Authorization: Bearer <your key>', ''];
  if (r.status === 'refused') parts.push('Nothing is sent for assessment requests.');
  else {
    parts.push(`1) Query rewriting${settings.llm.rewrite ? '' : ' (currently off)'}`, JSON.stringify(requestBody(provider, m, rewritePayload(r.query)), null, 2), '');
    const { send, withheld } = filterExcerpts((r.results ?? []).map((x) => x.excerpt));
    const allowed = current && labelsAllowed(current.index);
    parts.push(`2) Result labels${!allowed ? ' (blocked for this course: external processing not permitted)' : settings.llm.labels ? '' : ' (currently off)'}`);
    parts.push(send.length ? JSON.stringify(requestBody(provider, m, labelPayload(send.map((s) => s.text))), null, 2) : '(no excerpts)');
    if (withheld.length) parts.push(`(${withheld.length} excerpt(s) withheld because they look personal)`);
  }
  $('llm-preview').textContent = parts.join('\n');
}

function renderLLMSettings() {
  const { provider, model, rewrite, labels } = settings.llm;
  $('llm-provider').value = provider;
  $('llm-model').value = model;
  $('llm-key-link').href = PROVIDERS[provider].keyPage;
  $('llm-rewrite').checked = rewrite;
  $('llm-labels').checked = labels;
  getKey().then((k) => {
    $('llm-key').placeholder = k ? 'Key saved for this browser session' : 'sk-…';
  });
}

$('llm-provider').addEventListener('change', async (e) => {
  settings.llm.provider = e.target.value;
  settings.llm.model = PROVIDERS[e.target.value].defaultModel;
  await saveSettings();
  renderLLMSettings();
});

$('llm-model').addEventListener('change', async (e) => {
  settings.llm.model = e.target.value.trim() || PROVIDERS[settings.llm.provider].defaultModel;
  await saveSettings();
});

$('llm-save').addEventListener('click', () => {
  const p = PROVIDERS[settings.llm.provider];
  const typed = $('llm-key').value.trim();
  // permissions.request must run directly in the click handler.
  chrome.permissions.request({ origins: [p.hostPermission] }).then(async (ok) => {
    if (!ok) return void ($('llm-status').textContent = `Permission to contact ${p.label} was not granted; nothing was sent.`);
    if (typed) await chrome.storage.session.set({ llmKey: typed });
    $('llm-key').value = '';
    const key = await getKey();
    if (!key) return void ($('llm-status').textContent = 'Enter a key first.');
    $('llm-status').textContent = `Testing ${p.label}…`;
    try {
      const r = await createLLM({ provider: settings.llm.provider, model: settings.llm.model, apiKey: key }).testConnection();
      $('llm-status').textContent = `Connected to ${p.label} (${settings.llm.model}) in ${r.ms} ms. Turn on the options below to use it.`;
    } catch (err) {
      $('llm-status').textContent = `Connection test failed: ${err.message}. Local search is unaffected.`;
    }
    renderLLMSettings();
  });
});

$('llm-remove').addEventListener('click', async () => {
  await chrome.storage.session.remove('llmKey');
  settings.llm.rewrite = settings.llm.labels = false;
  await saveSettings();
  $('llm-status').textContent = 'Key removed. AI query help is off.';
  renderLLMSettings();
});

for (const [id, field] of [
  ['llm-rewrite', 'rewrite'],
  ['llm-labels', 'labels'],
]) {
  $(id).addEventListener('change', async (e) => {
    if (e.target.checked && !(await getKey())) {
      e.target.checked = false;
      $('llm-status').textContent = 'Save an API key first.';
      return;
    }
    settings.llm[field] = e.target.checked;
    await saveSettings();
  });
}

// Check access before opening a Panopto result, so revoked recordings give a clear message.
async function openPanopto(e, video, x) {
  e.preventDefault();
  const origin = new URL(video.url).origin;
  try {
    const tabs = (await chrome.permissions.contains({ origins: [`${origin}/*`] })) ? await chrome.tabs.query({ url: `${origin}/*` }) : [];
    if (tabs.length) {
      const c = await fetchSessionCaptions(pageFetchIn(tabs[0].id), origin, video.id);
      if (c.captionStatus === 'access_revoked' || c.captionStatus === 'broken_link') {
        $('search-status').textContent = `${video.title}: ${c.error} Rewind cannot open it. Reindex the course to update the list.`;
        return;
      }
    }
  } catch {}
  chrome.tabs.create({ url: x.url });
}

// Arrow keys move between result links.
for (const id of ['results', 'related-list']) {
  $(id).addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = [...document.querySelectorAll('#results a.open, #related-list a.open')];
    const i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    links[(i + (e.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length].focus();
  });
}
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    const first = document.querySelector('#results a.open, #related-list a.open');
    if (first) {
      e.preventDefault();
      first.focus();
    }
  }
});

// ---------- data ----------
async function renderStorage() {
  try {
    const courses = await store.list();
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    $('storage-line').textContent = `${courses.length} indexed course${courses.length === 1 ? '' : 's'} stored on this device${est ? ` · about ${(est.usage / 2 ** 20).toFixed(1)} MB used by Rewind (including the model, if downloaded)` : ''}.`;
  } catch {}
}

$('delete-all').addEventListener('click', (e) =>
  confirmThen(e.currentTarget, 'Confirm: delete everything', async () => {
    await store.clearAll();
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    settings.activeCourseId = null;
    settings.llm = { ...LLM_DEFAULTS };
    settings.externalOk = {};
    renderLLMSettings();
    await saveSettings();
    const c = await store.counts();
    $('delete-status').textContent = `Deleted all indexed courses, captions, vectors and settings (remaining records: ${c.meta + c.courses + c.vectors}), and removed any saved API key. The downloaded model was kept; remove it above if you want.`;
    await selectCourse(DEMO_COURSE_ID);
    renderStorage();
  })
);

// ---------- start ----------
async function init() {
  await loadSettings();
  const sel = $('model-select');
  for (const m of Object.values(MODELS)) {
    sel.append(el('option', { value: m.key, text: `${m.id}${m.key === DEFAULT_MODEL ? ' (default)' : ''}${m.key === 'e5-small' ? ' — proposal model' : ''}` }));
  }
  sel.value = settings.model;
  renderModelState(embed.state);
  renderLLMSettings();
  startModelIfInstalled();
  const known = settings.activeCourseId && (settings.activeCourseId === DEMO_COURSE_ID || (await store.list()).some((c) => c.courseId === settings.activeCourseId));
  await selectCourse(known ? settings.activeCourseId : DEMO_COURSE_ID);
}
init();

// Exposed for the benchmark page and end-to-end tests only; never used by the page itself.
globalThis.__rewind = { get current() { return current; }, embed, settings, formatTime };
