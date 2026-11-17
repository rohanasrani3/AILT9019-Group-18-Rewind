// Optional local transcription for LICENSED or explicitly AUTHORISED media only (proposal Section 5).
// Not part of the extension and not an MVP acceptance gate.
//
//   node tools/whisper/transcribe.mjs <media-id> [--from 0] [--to 600] [--out file.vtt]
//   node tools/whisper/transcribe.mjs --url <https://...> --permission "<who allowed it, when>" [...]
//
// - Runs Whisper locally (Transformers.js, Xenova/whisper-base.en, pinned). Nothing is uploaded.
// - Media is downloaded to a private temporary folder, decoded by ffmpeg, and the temporary
//   copy is always deleted afterwards (also on error). It is never bundled or shared.
// - Output is WebVTT headed "Machine-transcribed; not verified", with the licence/permission note.
// - Unusable output (almost no words, or repetition loops) is rejected with an explicit notice.
import fs from 'node:fs/promises';
import os from 'node:os';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as transformers from '@huggingface/transformers';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const WHISPER = { id: 'Xenova/whisper-base.en', revision: '95bf40a508535962c6483ead40270b2e32267508', dtype: 'q8' };
const MACHINE_NOTE = 'Machine-transcribed; not verified';

const argv = process.argv.slice(2);
const opt = (name, dflt) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : dflt);

export function formatVttTime(s) {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

// Rejects output that is clearly unusable: too few words for the audio length, or a model loop.
export function usability(chunks, seconds) {
  const words = chunks.flatMap((c) => c.text.trim().split(/\s+/).filter(Boolean));
  const wpm = words.length / Math.max(1, seconds / 60);
  if (wpm < 20) return { ok: false, reason: `only ${Math.round(wpm)} words per minute were recognised` };
  const texts = chunks.map((c) => c.text.trim().toLowerCase()).filter(Boolean);
  let run = 1;
  for (let i = 1; i < texts.length; i++) {
    run = texts[i] === texts[i - 1] ? run + 1 : 1;
    if (run >= 5) return { ok: false, reason: 'the model repeated the same line 5+ times (a known Whisper failure)' };
  }
  return { ok: true, wpm: Math.round(wpm) };
}

export function toVtt(chunks, header) {
  const lines = ['WEBVTT', '', `NOTE ${MACHINE_NOTE}`, ...header.map((h) => `NOTE ${h}`), ''];
  for (const c of chunks) {
    const t = c.text.trim();
    if (!t) continue;
    lines.push(`${formatVttTime(c.start)} --> ${formatVttTime(Math.max(c.end, c.start + 0.5))}`, t, '');
  }
  return lines.join('\n');
}

function decodeAudio(url, from, to) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-ss', String(from), ...(to != null ? ['-t', String(to - from)] : []), '-i', url, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'];
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const parts = [];
    let err = '';
    ff.stdout.on('data', (d) => parts.push(d));
    ff.stderr.on('data', (d) => (err += d));
    ff.on('error', (e) => reject(new Error(`ffmpeg is required on PATH (${e.message})`)));
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg failed: ${err.trim().slice(0, 300)}`));
      const buf = Buffer.concat(parts);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4)));
    });
  });
}

async function main() {
  const registry = JSON.parse(await fs.readFile(path.join(here, 'licensed-media.json'), 'utf8'));
  const id = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
  let media;
  let consent;
  if (id) {
    media = registry.media.find((m) => m.id === id);
    if (!media) throw new Error(`Unknown media id "${id}". Known: ${registry.media.map((m) => m.id).join(', ')}`);
    consent = `Licence: ${media.licence}`;
  } else {
    const url = opt('url');
    const permission = opt('permission');
    if (!url) throw new Error('Give a media id from licensed-media.json, or --url with --permission.');
    if (!permission) {
      throw new Error('Refused: this media is not in licensed-media.json. Only transcribe media you are licensed or explicitly authorised to download and transcribe; pass --permission "<who allowed it, when>" to record that authorisation.');
    }
    media = { id: 'custom', title: url, url };
    consent = `Permission: ${permission}`;
  }

  const from = Number(opt('from', 0));
  const to = opt('to') != null ? Number(opt('to')) : null;
  const out = opt('out', path.join(root, 'tools', 'whisper', 'output', `${media.id}${to != null ? `-${from}-${to}` : ''}.vtt`));

  console.log(`${MACHINE_NOTE}. Transcribing "${media.title}" (${from}s–${to ?? 'end'}s) locally with ${WHISPER.id}.`);
  console.log(consent);
  let t = performance.now();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rewind-whisper-'));
  let audio;
  try {
    let input = media.url;
    if (/^https?:/.test(media.url)) {
      const res = await fetch(media.url);
      if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
      input = path.join(tmp, 'media' + (path.extname(new URL(res.url).pathname) || '.bin'));
      await streamPipeline(Readable.fromWeb(res.body), createWriteStream(input));
    }
    audio = await decodeAudio(input, from, to);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }); // temporary media is always deleted
  }
  const seconds = audio.length / 16000;
  console.log(`Decoded ${seconds.toFixed(0)} s of audio (${((performance.now() - t) / 1000).toFixed(1)} s); the temporary media copy has been deleted.`);

  transformers.env.cacheDir = path.join(root, '.cache', 'models');
  const asr = await transformers.pipeline('automatic-speech-recognition', WHISPER.id, { revision: WHISPER.revision, dtype: WHISPER.dtype });
  t = performance.now();
  const res = await asr(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  const asrSeconds = (performance.now() - t) / 1000;
  const chunks = (res.chunks ?? []).map((c) => ({ start: from + (c.timestamp[0] ?? 0), end: from + (c.timestamp[1] ?? c.timestamp[0] ?? 0), text: c.text }));

  const u = usability(chunks, seconds);
  if (!u.ok) {
    console.error(`Transcript rejected as unusable: ${u.reason}. Nothing was written; this video stays unindexed.`);
    process.exit(3);
  }
  const vtt = toVtt(chunks, [`Source: ${media.url}`, consent, `Model: ${WHISPER.id}@${WHISPER.revision.slice(0, 8)}`, `Generated: ${new Date().toISOString()}`]);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, vtt);
  console.log(`Wrote ${path.relative(root, out)}: ${chunks.length} segments, ~${u.wpm} words/min, transcription took ${asrSeconds.toFixed(0)} s (${(seconds / asrSeconds).toFixed(1)}× real time).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
