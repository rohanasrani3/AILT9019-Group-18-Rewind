// Excerpts that look personal are never sent to an external API (proposal Section 5:
// "Exclude personal or sensitive passages from external requests"). Deliberately cautious:
// a false positive only means one excerpt keeps no label.

const PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // email address
  /(?:\+?\d[\d\s-]{7,}\d)/, // phone-like digit run
  /\b3\d{9}\b/, // HKU UID format
  /\b(?:my name is|i'?m called|student (?:number|id)|uid)\b/i,
  /\b(?:your|his|her) (?:grade|mark|score)s? (?:is|was)\b/i,
  /我叫|我的名字|学号|學號|电话|電話/,
];

export function isSensitive(text) {
  return PATTERNS.some((p) => p.test(String(text ?? '')));
}

// Returns { send: [{i, text}], withheld: [i] } for a list of excerpts.
export function filterExcerpts(excerpts) {
  const send = [];
  const withheld = [];
  excerpts.forEach((text, i) => (isSensitive(text) ? withheld.push(i) : send.push({ i, text })));
  return { send, withheld };
}
