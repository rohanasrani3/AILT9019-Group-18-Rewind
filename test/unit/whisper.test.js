import { describe, it, expect } from 'vitest';
import { usability, toVtt, formatVttTime } from '../../tools/whisper/transcribe.mjs';
import { normalise, wer } from '../../tools/whisper/wer.mjs';
import { parseCaptions } from '../../src/core/captions.js';
import { buildCourseIndex } from '../../src/core/indexer.js';
import { search } from '../../src/core/search.js';
import { configFor } from '../../src/core/config.js';

describe('Whisper tool helpers', () => {
  it('writes VTT marked as machine-transcribed that Rewind can parse', () => {
    const vtt = toVtt([{ start: 0, end: 4.2, text: ' The master method. ' }, { start: 4.2, end: 4.2, text: '' }, { start: 5, end: 9, text: 'Three cases.' }], ['Licence: CC BY-NC-SA 4.0']);
    expect(vtt).toMatch(/^WEBVTT\n\nNOTE Machine-transcribed; not verified\nNOTE Licence/);
    expect(parseCaptions(vtt)).toEqual([
      { start: 0, end: 4.2, text: 'The master method.' },
      { start: 5, end: 9, text: 'Three cases.' },
    ]);
    expect(formatVttTime(3725.5)).toBe('01:02:05.500');
  });

  it('rejects unusable transcripts', () => {
    expect(usability([{ text: 'hello' }], 600).ok).toBe(false);
    const loop = Array.from({ length: 40 }, () => ({ text: 'Thank you for watching.' }));
    expect(usability(loop, 60)).toMatchObject({ ok: false, reason: expect.stringMatching(/repeated/) });
    const fine = Array.from({ length: 30 }, (_, i) => ({ text: `sentence number ${i} about the master method and recurrences` }));
    expect(usability(fine, 120).ok).toBe(true);
  });

  it('computes word error rate with normalisation', () => {
    expect(normalise("The Master-Method, [inaudible] it's O(n)!")).toEqual(['the', 'master', 'method', "it's", 'o', 'n']);
    expect(wer(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e'])).toMatchObject({ wer: 0.5, substitutions: 1, deletions: 0, insertions: 1 });
    expect(wer(['a', 'b'], [])).toMatchObject({ wer: 1, deletions: 2 });
  });

  it('machine-transcribed videos are flagged in search results', async () => {
    const config = { ...configFor('e5-small'), kwMinScore: 0 };
    const ix = await buildCourseIndex(
      { courseId: 'c' },
      [{ id: 'w', title: 'Whisper lecture', kind: 'youtube', url: 'https://www.youtube.com/watch?v=w', machineTranscribed: true, cues: [{ start: 0, end: 10, text: 'the master method has three cases' }] }],
      { config }
    );
    const r = await search(ix, 'master method', { config });
    expect(r.results[0].machineTranscribed).toBe(true);
  });
});
