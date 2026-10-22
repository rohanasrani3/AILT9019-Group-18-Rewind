// Deterministic stand-in for the embedding model: each text maps onto a few "concept" axes via a
// small bilingual dictionary, so tests can exercise paraphrase and Chinese retrieval offline.

const CONCEPTS = [
  ['recurrence', 'master', 'theorem', 'method', 'shortcut', 'recursion', '主定理', '递归'],
  ['quicksort', 'pivot', 'partition', 'sort', 'sorting', '快速排序', '排序'],
  ['hash', 'hashing', 'collision', 'collisions', 'chaining', 'slot', '哈希', '冲突'],
  ['photosynthesis', 'plants', 'chlorophyll', '光合作用'],
];

export function fakeEmbedder() {
  const dim = CONCEPTS.length + 1;
  const embed = (text) => {
    const t = text.toLowerCase();
    const v = new Float32Array(dim);
    CONCEPTS.forEach((words, i) => {
      for (const w of words) if (t.includes(w)) v[i] += 1;
    });
    v[dim - 1] = 0.3; // shared background so unrelated texts are not exactly orthogonal
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  return {
    dim,
    embedQuery: async (q) => embed(q),
    embedPassages: async (texts) => texts.map(embed),
  };
}

const cuesFrom = (lines, startAt = 0) => lines.map((text, i) => ({ start: startAt + i * 10, end: startAt + i * 10 + 10, text }));

export function fixtureVideos() {
  const filler = (k) => Array.from({ length: k }, () => 'okay so let us continue with the lecture now');
  return [
    {
      id: 'rec',
      title: 'Recurrences',
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=rec',
      cues: cuesFrom([...filler(6), 'the master method gives the answer for a recurrence', 'master theorem has three cases for the recursion', 'compare f of n with n to the log base b of a', ...filler(6)]),
    },
    {
      id: 'qs',
      title: 'Quicksort',
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=qs',
      cues: cuesFrom(['quicksort picks a pivot', 'partition the array around the pivot', 'sorting in place', ...filler(10)]),
    },
    {
      id: 'hash',
      title: 'Hashing',
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=hash',
      cues: cuesFrom([...filler(4), 'a collision happens when two keys hash to the same slot', 'resolve collisions by chaining with a linked list', ...filler(6)]),
    },
  ];
}
