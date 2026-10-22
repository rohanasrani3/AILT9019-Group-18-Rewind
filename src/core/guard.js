// Assessment-request check. Runs before any search. Rewind finds explanations in lectures;
// it never answers assessment questions. A query is refused when it either
//   (a) points at a specific numbered assessment item ("question 2", "assignment 1", "第2题"), or
//   (b) pairs a solving verb ("solve", "answer", "帮我做") with an assessment noun ("homework", "作业").
// Benign uses ("variable assignment", "how does an exam-style recurrence work") are not refused.

const NUM = '(?:\\d+|[ivx]+|one|two|three|four|five|six|seven|eight|nine|ten)';
const EN_ITEM = new RegExp(
  `\\b(?:(?:assignment|homework|hw|problem\\s*set|pset|p-set|quiz|exam|midterm|lab|tutorial|worksheet)\\s*#?\\s*${NUM}\\b|(?:question|q|problem|exercise)\\s*#?\\s*\\d+[a-z]?\\b|\\bq\\d+\\b)`,
  'i'
);
const EN_OBJECT = /\b(?:homework|hw\d*|problem\s*sets?|psets?|p-sets?|quiz(?:zes)?|exams?|midterms?|final\s+exam|test\s+questions?|tutorial\s+(?:questions?|sheets?)|worksheets?|(?:my|the|this|our|an?)\s+assignments?|assignments?\s+(?:questions?|problems?)|graded)\b/i;
const EN_VERB = /\b(?:solve[sd]?|solving|solutions?|answers?|answered|do\s+(?:my|the|this)|complete|finish|work\s+out|write\s+(?:the|my)\s+(?:code|answer|proof|solution)|give\s+me\s+the|tell\s+me\s+the\s+answer|help\s+me\s+(?:with|do|solve|finish|complete)|cheat)\b/i;

const ZH_NUM = '[0-9０-９一二三四五六七八九十百]+';
const ZH_ITEM = new RegExp(`第\\s*${ZH_NUM}\\s*(?:题|道题|问|小题)|(?:作业|习题|练习|测验|小测|考试|试卷|期中|期末)\\s*${ZH_NUM}`);
const ZH_OBJECT = /作业|功课|习题|练习题|考试|考题|测验|小测|期中|期末|试卷|试题|题目|这道题|这题/;
const ZH_VERB = /解答|解题|求解|答案|帮我|帮忙|替我|代做|做一下|做完|完成|怎么做|怎么解|如何解|写出|给出|算出|答一下/;

// Words to strip when deriving a "related topic" from a refused query.
const STRIP = new RegExp(
  [EN_ITEM.source, EN_OBJECT.source, EN_VERB.source, ZH_ITEM.source, ZH_OBJECT.source, ZH_VERB.source,
    '\\b(?:of|for|to|on|in|the|my|me|please|can|you|how|what|is|a|and|with)\\b', '[的了吗呢吧请我你给把这道题]'].join('|'),
  'gi'
);

export const REFUSAL_NOTICE =
  'Rewind does not solve assessment questions. It can only point you to where a topic was explained in the lectures.';

export function checkAssessment(query) {
  const q = String(query ?? '');
  const item = EN_ITEM.test(q) || ZH_ITEM.test(q);
  const verbObject = (EN_VERB.test(q) || ZH_VERB.test(q)) && (EN_OBJECT.test(q) || ZH_OBJECT.test(q) || item);
  const refuse = item || verbObject;
  if (!refuse) return { refuse: false };
  const topic = q.replace(STRIP, ' ').replace(/[?？,，.。!！:：;；"'“”]/g, ' ').replace(/\s+/g, ' ').trim();
  return { refuse: true, reason: item ? 'assessment-item' : 'solve-request', topic, notice: REFUSAL_NOTICE };
}
