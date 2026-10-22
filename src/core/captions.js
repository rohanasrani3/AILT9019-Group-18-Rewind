// Caption parsing: SRT, WebVTT and Panopto caption JSON -> cues [{start, end, text}] (seconds).
// Caption text is treated strictly as data. Nothing here interprets it.

const TS = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

export function parseTimestamp(s) {
  const m = TS.exec(s);
  if (!m) return NaN;
  const [, h = '0', mi, se, ms] = m;
  return Number(h) * 3600 + Number(mi) * 60 + Number(se) + Number(ms.padEnd(3, '0')) / 1000;
}

export function cleanText(t) {
  return t
    .replace(/<[^>]+>/g, ' ') // VTT voice/style tags, HTML
    .replace(/\{\\[^}]*\}/g, ' ') // SSA-style overrides occasionally left in SRT
    .replace(/^\s*(?:>>|-)\s*/gm, ' ') // speaker-change markers
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Shared by SRT and VTT: both are blank-line separated blocks with a "a --> b" timing line.
function parseBlocks(raw) {
  const cues = [];
  const blocks = raw.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const text = cleanText(lines.slice(i + 1).join(' '));
    if (text) cues.push({ start, end: Math.max(end, start), text });
  }
  return cues;
}

export function parseSRT(raw) {
  return raw ? parseBlocks(raw) : [];
}

export function parseVTT(raw) {
  if (!raw) return [];
  // Drop the header and NOTE/STYLE/REGION blocks; parseBlocks ignores blocks without timings anyway.
  return parseBlocks(raw.replace(/^﻿?WEBVTT[^\n]*\n/, ''));
}

// Panopto's DeliveryInfo/caption JSON: [{Caption|Text, Time (s), CaptionDuration|Duration (s)}]
export function parsePanoptoJSON(items) {
  if (!Array.isArray(items)) return [];
  const cues = [];
  for (const it of items) {
    const text = cleanText(String(it.Caption ?? it.Text ?? ''));
    const start = Number(it.Time ?? it.Start);
    const dur = Number(it.CaptionDuration ?? it.Duration ?? 0);
    if (text && Number.isFinite(start)) cues.push({ start, end: start + (Number.isFinite(dur) ? dur : 0), text });
  }
  return cues;
}

export function parseCaptions(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return parsePanoptoJSON(raw);
  const s = String(raw);
  if (!s.trim()) return [];
  if (/^﻿?WEBVTT/.test(s)) return parseVTT(s);
  const t = s.trimStart();
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      return parsePanoptoJSON(Array.isArray(j) ? j : j.Captions ?? j.Delivery?.Captions ?? []);
    } catch {
      return [];
    }
  }
  return parseSRT(s);
}

// Many auto-caption tracks repeat the previous line as a rolling window; collapse exact repeats.
export function dedupeCues(cues) {
  const out = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    if (prev && prev.text === c.text) {
      prev.end = Math.max(prev.end, c.end);
      continue;
    }
    out.push({ ...c });
  }
  return out;
}
