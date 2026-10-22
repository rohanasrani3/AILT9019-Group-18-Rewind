// Tokenizer for the keyword index. English: lowercase, stopwords, light suffix stemming.
// CJK: character unigrams + bigrams (no dictionary needed, works for mixed queries).

const STOP = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both
  but by can could did do does doing down during each few for from further had has have having he her here hers
  him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our
  out over own same she should so some such than that the their them then there these they this those through to
  too under until up very was we were what when where which while who whom why will with would you your yours
  okay ok yeah um uh so gonna wanna kind sort thing things lot like get got go going let us say said see well
  really right actually basically just also`.split(/\s+/)
);

const CJK = /[㐀-䶿一-鿿豈-﫿]/;
const CJK_RUN = /[㐀-䶿一-鿿豈-﫿]+/g;
const WORD = /[a-z0-9]+(?:'[a-z]+)?/g;

export function stem(w) {
  if (w.length <= 3) return w;
  w = w.replace(/'s$/, '');
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (/(?:ss|us|is)$/.test(w)) return w;
  for (const suf of ['ational', 'ization', 'ically', 'ations', 'ation', 'ness', 'ments', 'ment', 'ings', 'ing', 'edly', 'ed', 'ly', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      let base = w.slice(0, -suf.length);
      // sorting -> sort, running -> run (undouble), hashed -> hash
      if ((suf === 'ing' || suf === 'ed') && /([b-df-hj-np-tv-z])\1$/.test(base) && !/(?:ll|ss|zz)$/.test(base)) base = base.slice(0, -1);
      return base;
    }
  }
  return w;
}

export function hasCJK(s) {
  return CJK.test(s);
}

export function tokenize(text) {
  const out = [];
  const s = String(text).toLowerCase();
  for (const run of s.match(CJK_RUN) ?? []) {
    for (let i = 0; i < run.length; i++) {
      out.push(run[i]);
      if (i + 1 < run.length) out.push(run.slice(i, i + 2));
    }
  }
  const latin = s.replace(CJK_RUN, ' ');
  for (const w of latin.match(WORD) ?? []) {
    if (STOP.has(w)) continue;
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}
