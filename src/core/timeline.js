// Concept timeline: each video split at its topic boundaries, every segment labelled with the
// terms that are most distinctive for it (TF-IDF against the whole course). Local only.
import { tokenize, stem } from './tokenize.js';
import { linkAt, formatTime } from './links.js';

const WORD = /[a-z][a-z'-]{2,}/g;
// Spoken filler that survives stopword removal but never names a concept.
const FILLER = new Set(['know', 'think', 'want', 'need', 'thing', 'way', 'make', 'look', 'case', 'time', 'little', 'good', 'mean', 'idea', 'just', 'question', 'write', 'call', 'use', 'thing', 'number', 'work', 'pretty', 'point', 'kind', 'whatever', 'saying', 'gonna', 'hmm', 'yes', 'sure', 'today', 'last', 'next', 'first', 'second', 'going', 'come', 'take', 'give', 'show', 'happen', 'remember', 'notice', 'turn', 'means', 'okay', 'alright', 'actually', 'basically', 'everybody', 'somebody', 'anything', 'something', 'nothing', 'everything', 'people', 'lecture', 'class', 'board', 'let', 'get', 'got', 'bit', 'lot', 'sort', 'one', 'two', 'three', 'four', 'five',
  'not', 'big', 'side', 'hand', 'sign', 'answer', 'slightly', 'check', 'exciting', 'hosed', 'minutes', 'imagine', 'clever', 'amazingly',
  'task', 'surprise', 'extra', 'fuzzy', 'eager', 'least', 'dot', 'cross', 'blank', 'odds', 'aim', 'directly', 'instance', 'stuff',
  'right', 'wrong', 'true', 'false', 'easy', 'hard', 'nice', 'cool', 'interesting', 'obvious', 'sense', 'reason', 'example', 'fact']);

function segmentsOf(index, vi) {
  const video = index.videos[vi];
  const windows = index.windows.filter((w) => w.v === vi);
  if (!windows.length) return [];
  const end = video.duration ?? windows[windows.length - 1].end;
  const starts = [...new Set(index.boundaries?.[vi]?.length ? index.boundaries[vi] : [windows[0].start])].sort((a, b) => a - b);
  return starts.map((s, i) => ({ start: s, end: starts[i + 1] ?? end }));
}

function segmentText(index, vi, seg) {
  // Windows overlap by design; take every window starting inside the segment.
  return index.windows.filter((w) => w.v === vi && w.start >= seg.start && w.start < seg.end).map((w) => w.text).join(' ');
}

// Map stems back to the most common surface word, so labels read naturally.
function surfaceForms(text, out) {
  for (const w of String(text).toLowerCase().match(WORD) ?? []) {
    const s = stem(w);
    const m = (out.get(s) ?? out.set(s, new Map()).get(s));
    m.set(w, (m.get(w) ?? 0) + 1);
  }
}

export function buildTimeline(index, { terms = 3, minSegmentSeconds = 30 } = {}) {
  const segs = [];
  index.videos.forEach((v, vi) => {
    if (v.captionStatus !== 'indexed') return;
    for (const seg of segmentsOf(index, vi)) {
      if (seg.end - seg.start < minSegmentSeconds && segs.length && segs[segs.length - 1].vi === vi) {
        segs[segs.length - 1].end = seg.end; // fold very short tails into the previous segment
        continue;
      }
      segs.push({ vi, ...seg });
    }
  });

  const surface = new Map();
  const docs = segs.map((s) => {
    const text = segmentText(index, s.vi, s);
    surfaceForms(text, surface);
    const tf = new Map();
    for (const t of tokenize(text)) if (/^[a-z]/.test(t) && t.length > 2 && !FILLER.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    // A label term should recur in the segment, not be a one-off remark.
    for (const [t, c] of tf) if (c < 2) tf.delete(t);
    return tf;
  });
  const df = new Map();
  for (const tf of docs) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;

  const readable = (st) => {
    const forms = surface.get(st);
    if (!forms) return st;
    return [...forms].sort((a, b) => b[1] - a[1])[0][0];
  };

  return index.videos.map((video, vi) => ({
    videoIndex: vi,
    title: video.title,
    segments: segs
      .map((s, i) => ({ s, tf: docs[i] }))
      .filter(({ s }) => s.vi === vi)
      .map(({ s, tf }) => {
        const scored = [...tf].map(([t, c]) => [t, c * Math.log((n + 1) / ((df.get(t) ?? 0) + 1))]).filter(([, x]) => x > 0);
        scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const words = [];
        for (const [t] of scored) {
          const w = readable(t);
          if (!words.includes(w) && !FILLER.has(w)) words.push(w);
          if (words.length >= terms) break;
        }
        return { start: s.start, end: s.end, time: formatTime(s.start), terms: words, url: linkAt(video, s.start) };
      }),
  }));
}
