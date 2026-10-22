// Overlapping fixed-length time windows over a cue list.
// Default: 45 s windows every 15 s, so each moment appears in three windows.

export const DEFAULT_WINDOW = 45;
export const DEFAULT_STRIDE = 15;

export function buildWindows(cues, { videoId, size = DEFAULT_WINDOW, stride = DEFAULT_STRIDE } = {}) {
  if (!cues.length) return [];
  const first = Math.floor(cues[0].start / stride) * stride;
  const last = cues[cues.length - 1].end;
  const windows = [];
  let ci = 0; // first cue that might still overlap the current window
  for (let t = first; t < last; t += stride) {
    const tEnd = t + size;
    while (ci < cues.length && cues[ci].end <= t) ci++;
    const parts = [];
    let start = Infinity;
    let end = t;
    for (let j = ci; j < cues.length && cues[j].start < tEnd; j++) {
      // Assign a cue to the window if its midpoint falls inside, so text is not cut mid-sentence twice.
      const mid = (cues[j].start + cues[j].end) / 2;
      if (mid < t || mid >= tEnd) continue;
      parts.push(cues[j].text);
      start = Math.min(start, cues[j].start);
      end = Math.max(end, cues[j].end);
    }
    if (!parts.length) continue;
    windows.push({ videoId, start: Math.max(0, Math.floor(start)), end: Math.ceil(end), text: parts.join(' ') });
    if (tEnd >= last) break;
  }
  return windows;
}
