# Rewind evaluation — test set, e5-small

> **PROVISIONAL — not reportable as final results.** 50 of 50 questions are unverified; test set not frozen.

Generated 2026-10-22T08:21:13.034Z · AMD Ryzen 7 250 w/ Radeon 780M Graphics, 16 threads, 31 GB RAM · win32 10.0.26300 · Node v24.21.0
Corpus: 10 videos, 12.8 h captions, 3054 windows · index build 70680 ms · model load 665 ms

| Type | N | Hybrid Hit@1 | Hybrid Hit@3 | Keyword Hit@1 | Keyword Hit@3 |
|---|---|---|---|---|---|
| exact | 12 | 7/12 (58%) | 10/12 (83%) | 6/12 (50%) | 10/12 (83%) |
| paraphrased | 12 | 5/12 (42%) | 7/12 (58%) | 4/12 (33%) | 7/12 (58%) |
| zh_mixed | 12 | 1/12 (8%) | 1/12 (8%) | 0/12 (0%) | 0/12 (0%) |
| **all answerable** | 36 | 13/36 (36%) | 18/36 (50%) | 10/36 (28%) | 17/36 (47%) |

Not found correct: hybrid 7/8 (88%), keyword 5/8 (63%)
Refusals: 6/6 (100%) · false refusals on answerable questions: 0
Median local retrieval latency (hybrid, after warm-up, Node): 5.3 ms

## Proposal targets

| Target | Value | Pass |
|---|---|---|
| paraphrased Hit@3 >= 80% | 7/12 | **no** |
| paraphrased Hit@3 >= baseline + 20 pts | 58% vs 58% | **no** |
| zh_mixed Hit@3 >= 80% | 1/12 | **no** |
| zh_mixed Hit@3 >= baseline + 20 pts | 8% vs 0% | **no** |
| not-found >= 7/8 | 7/8 | yes |
| refusals 6/6 | 6/6 | yes |
| median local retrieval < 2 s | 5.3 ms | yes |

## Per-question (hybrid)

| ID | Type | Query | Status | Top results | Correct |
|---|---|---|---|---|---|
| T-EX-01 | exact | master theorem | results | L2@56:45, L2@48:43, L2@51:30 | yes |
| T-EX-02 | exact | insertion sort | results | L1@1:03:02, L1@36:42, L1@1:19:31 | yes |
| T-EX-03 | exact | substitution method | results | L9@1:11:57, L4@1:11:44, L2@17:14 | yes |
| T-EX-04 | exact | Strassen's algorithm | results | L3@42:30, L3@49:46, L6@44:09 | yes |
| T-EX-05 | exact | randomized quicksort | results | L9@16:31, L5@30:43, L4@1:19:01 | **no** |
| T-EX-06 | exact | decision tree model | results | L5@12:15, L5@14:00, L5@17:58 | yes |
| T-EX-07 | exact | radix sort | results | L5@49:55 | yes |
| T-EX-08 | exact | universal hashing | not_found | — | **no** |
| T-EX-09 | exact | red-black tree properties | results | L10@6:02, L10@1:19:13, L10@17:34 | yes |
| T-EX-10 | exact | open addressing | results | L7@51:00, L7@53:44 | yes |
| T-EX-11 | exact | worst-case linear-time order statistics | results | L6@43:29, L6@3:58, L6@44:46 | yes |
| T-EX-12 | exact | big omega notation | results | L2@10:14 | yes |
| T-PA-01 | paraphrased | shortcut for divide-and-conquer recurrences | results | L3@2:30, L3@8:00, L3@1:07:58 | **no** |
| T-PA-02 | paraphrased | why quicksort is fast on average | results | L4@0:08, L5@2:43, L4@46:46 | yes |
| T-PA-03 | paraphrased | why can't you sort faster than n log n by comparing elements | results | L1@1:19:46, L9@8:02, L5@3:46 | **no** |
| T-PA-04 | paraphrased | sorting integers in linear time by counting how often each value appears | results | L5@32:16, L5@44:29, L5@1:13:45 | yes |
| T-PA-05 | paraphrased | keeping a linked list in a slot when two keys land in the same place | results | L7@14:27, L7@21:00, L8@1:14:12 | yes |
| T-PA-06 | paraphrased | choosing the hash function at random so an adversary cannot pick bad keys | results | L8@4:15, L8@19:45, L8@0:34 | yes |
| T-PA-07 | paraphrased | computing x to the power n with fewer multiplications | results | L3@14:00, L7@41:27, L3@17:02 | yes |
| T-PA-08 | paraphrased | laying out a complete binary tree on a chip using little area | results | L3@55:58, L3@1:01:00, L10@12:16 | yes |
| T-PA-09 | paraphrased | finding the k-th smallest element quickly with a random pivot | results | L6@53:30, L6@11:29, L6@1:00 | yes |
| T-PA-10 | paraphrased | restructuring a search tree locally without breaking the ordering | results | L10@0:46, L10@41:15 | **no** |
| T-PA-11 | paraphrased | drawing out the cost at every level of the recursion and adding it up | results | L4@37:14, L2@1:02:01, L4@27:33 | **no** |
| T-PA-12 | paraphrased | why inserting keys into a search tree in random order is like quicksort | results | L9@2:30, L5@2:43, L4@46:46 | **no** |
| T-ZH-01 | zh_mixed | 主定理怎么用 | not_found | — | **no** |
| T-ZH-02 | zh_mixed | 快速排序的期望运行时间 | not_found | — | **no** |
| T-ZH-03 | zh_mixed | 比较排序的下界是多少 | not_found | — | **no** |
| T-ZH-04 | zh_mixed | 计数排序是怎么工作的 | not_found | — | **no** |
| T-ZH-05 | zh_mixed | 红黑树的旋转操作 | not_found | — | **no** |
| T-ZH-06 | zh_mixed | 哈希冲突用链表解决 | not_found | — | **no** |
| T-ZH-07 | zh_mixed | 如何在线性时间内找到中位数 | not_found | — | **no** |
| T-ZH-08 | zh_mixed | 随机二叉搜索树的期望高度 | not_found | — | **no** |
| T-ZH-09 | zh_mixed | master theorem 的三种情况 | not_found | — | **no** |
| T-ZH-10 | zh_mixed | quicksort 的 partition 怎么做 | results | L4@4:44, L4@16:46, L6@6:00 | yes |
| T-ZH-11 | zh_mixed | universal hashing 是什么意思 | not_found | — | **no** |
| T-ZH-12 | zh_mixed | Strassen 算法为什么只需要七次乘法 | not_found | — | **no** |
| T-NF-01 | not_covered | Dijkstra's shortest path algorithm | results | L5@18:47 | **no** |
| T-NF-02 | not_covered | dynamic programming for longest common subsequence | not_found | — | yes |
| T-NF-03 | not_covered | how photosynthesis works in plants | not_found | — | yes |
| T-NF-04 | not_covered | causes of the French Revolution | not_found | — | yes |
| T-NF-05 | not_covered | 如何训练神经网络 | not_found | — | yes |
| T-NF-06 | not_covered | greedy algorithm for minimum spanning trees | not_found | — | yes |
| T-NF-07 | not_covered | TCP congestion control | not_found | — | yes |
| T-NF-08 | not_covered | 供求关系如何决定价格 | not_found | — | yes |
| T-AS-01 | assessment | solve question 2 of assignment 1 | refused | — | yes |
| T-AS-02 | assessment | give me the answer to problem set 3 problem 4 | refused | — | yes |
| T-AS-03 | assessment | 帮我做作业第二题 | refused | — | yes |
| T-AS-04 | assessment | 作业1第3题的答案是什么 | refused | — | yes |
| T-AS-05 | assessment | write the code for my homework on red-black trees | refused | — | yes |
| T-AS-06 | assessment | quiz 1 question 5 master theorem 的答案 | refused | — | yes |
