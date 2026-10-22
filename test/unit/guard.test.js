import { describe, it, expect } from 'vitest';
import { checkAssessment } from '../../src/core/guard.js';

describe('assessment-request check', () => {
  const refuse = [
    'solve question 2 of assignment 1',
    'give me the answer to problem set 3 problem 4',
    '帮我做作业第二题',
    '作业1第3题的答案是什么',
    'write the code for my homework on red-black trees',
    'quiz 1 question 5 master theorem 的答案',
    'do my problem set 2 for me',
    '帮我解答期中考试第4题',
    "what's the solution to the midterm",
    'Q3 of hw2',
    'can you complete my assignment',
    '这道题怎么做',
  ];
  for (const q of refuse) {
    it(`refuses: ${q}`, () => {
      const r = checkAssessment(q);
      expect(r.refuse).toBe(true);
      expect(r.notice).toMatch(/does not solve assessment questions/);
    });
  }

  const allow = [
    'master theorem',
    'variable assignment in pseudocode',
    'why quicksort is fast on average',
    '主定理怎么用',
    'how do you solve recurrences with the substitution method',
    'what is an exam-style recurrence',
    'answer set of the decision tree',
    'red black tree insertion case 2',
    '如何理解红黑树',
    'quicksort 的 partition 怎么做',
    'lower bound for comparison sorting',
    'problem of finding the median',
  ];
  for (const q of allow) {
    it(`allows: ${q}`, () => {
      expect(checkAssessment(q).refuse).toBe(false);
    });
  }

  it('keeps the topic words for related-explanation links', () => {
    const r = checkAssessment('write the code for my homework on red-black trees');
    expect(r.topic).toMatch(/red-black trees/);
    expect(r.topic).not.toMatch(/homework|code/);
    const zh = checkAssessment('quiz 1 question 5 master theorem 的答案');
    expect(zh.topic).toMatch(/master theorem/);
  });
});
