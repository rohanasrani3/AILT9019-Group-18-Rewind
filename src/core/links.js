// Deep links that open the original, authorised video at a given second.

export function linkAt(video, seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (video.kind === 'youtube') return `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&t=${s}s`;
  if (video.kind === 'panopto') {
    const u = new URL(video.url);
    u.searchParams.set('start', String(s));
    return u.toString();
  }
  return video.url;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
