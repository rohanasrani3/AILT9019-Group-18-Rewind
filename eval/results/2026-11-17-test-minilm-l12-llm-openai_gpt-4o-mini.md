# Rewind evaluation — test set, minilm-l12 + LLM rewriting (openrouter: openai/gpt-4o-mini)

Generated 2026-11-17T09:58:11.687Z · AMD Ryzen 7 250 w/ Radeon 780M Graphics, 16 threads, 31 GB RAM · win32 10.0.26300 · Node v24.21.0
Corpus: 10 videos, 12.8 h captions, 3054 windows · index build 59239 ms · model load 751 ms

| Type | N | Hybrid Hit@1 | Hybrid Hit@3 | Keyword Hit@1 | Keyword Hit@3 |
|---|---|---|---|---|---|
| exact | 12 | 8/12 (67%) | 11/12 (92%) | 6/12 (50%) | 10/12 (83%) |
| paraphrased | 12 | 4/12 (33%) | 6/12 (50%) | 2/12 (17%) | 6/12 (50%) |
| zh_mixed | 12 | 7/12 (58%) | 8/12 (67%) | 0/12 (0%) | 0/12 (0%) |
| **all answerable** | 36 | 19/36 (53%) | 25/36 (69%) | 8/36 (22%) | 16/36 (44%) |

Not found correct: hybrid 5/8 (63%), keyword 5/8 (63%)
Refusals: 6/6 (100%) · false refusals on answerable questions: 0
Median local retrieval latency (hybrid, after warm-up, Node, excluding any API wait): 29.5 ms
LLM rewriting: openrouter openai/gpt-4o-mini · median API latency 1105 ms (reported separately, not part of the local target) · API errors 0 (those questions fell back to local search)
Baseline columns are plain keyword retrieval without the LLM.

## Proposal targets

| Target | Value | Pass |
|---|---|---|
| paraphrased Hit@3 >= 80% | 6/12 | **no** |
| paraphrased Hit@3 >= baseline + 20 pts | 50% vs 50% | **no** |
| zh_mixed Hit@3 >= 80% | 8/12 | **no** |
| zh_mixed Hit@3 >= baseline + 20 pts | 67% vs 0% | yes |
| not-found >= 7/8 | 5/8 | **no** |
| refusals 6/6 | 6/6 | yes |
| median local retrieval < 2 s | 29.5 ms | yes |

## Per-question (hybrid)

| ID | Type | Query | Rewrites | Status | Top results | Correct |
|---|---|---|---|---|---|---|
| T-EX-01 | exact | master theorem | Analysis of algorithms using Master Theorem | results | L2@56:45, L3@0:14, L5@17:29 | yes |
| T-EX-02 | exact | insertion sort | insertion sort algorithm · insertion sort example | results | L4@23:19, L1@36:29, L1@1:03:02 | yes |
| T-EX-03 | exact | substitution method | solving equations substitution | results | L2@17:14, L4@1:12:03, L9@1:11:57 | yes |
| T-EX-04 | exact | Strassen's algorithm | Strassen's matrix multiplication algorithm · Strassen algorithm explanation | results | L3@42:44, L3@54:00, L3@39:48 | yes |
| T-EX-05 | exact | randomized quicksort | randomized quicksort algorithm · quicksort performance analysis | results | L4@1:19:01, L4@46:30, L9@16:16 | yes |
| T-EX-06 | exact | decision tree model | decision tree algorithm · decision tree analysis | results | L5@17:44, L5@14:00, L5@6:45 | yes |
| T-EX-07 | exact | radix sort | radix sort algorithm · radix sort explanation | results | L5@49:29, L5@47:13 | yes |
| T-EX-08 | exact | universal hashing | hash function properties | results | L8@12:42, L8@19:16, L7@28:45 | yes |
| T-EX-09 | exact | red-black tree properties | properties of red-black trees | results | L10@6:02, L10@34:45, L10@1:19:32 | yes |
| T-EX-10 | exact | open addressing | open addressing technique · open addressing method | results | L7@51:00 | yes |
| T-EX-11 | exact | worst-case linear-time order statistics | worst-case linear time · order statistics analysis | results | L6@43:29, L6@3:58, L6@19:58 | yes |
| T-EX-12 | exact | big omega notation | asymptotic analysis big omega | results | L2@13:47 | **no** |
| T-PA-01 | paraphrased | shortcut for divide-and-conquer recurrences | divide-and-conquer recurrences · recurrence relations shortcuts | results | L3@6:29, L4@43:30, L3@51:36 | **no** |
| T-PA-02 | paraphrased | why quicksort is fast on average | average case performance of quicksort · quicksort efficiency analysis | results | L5@2:43, L4@1:19:01, L4@46:46 | yes |
| T-PA-03 | paraphrased | why can't you sort faster than n log n by comparing elements | sorting algorithms comparison · time complexity n log n | results | L5@4:30, L3@12:28, L9@10:28 | **no** |
| T-PA-04 | paraphrased | sorting integers in linear time by counting how often each value appears | linear time sorting · counting sort algorithm | results | L5@1:13:45, L5@44:29, L5@31:59 | **no** |
| T-PA-05 | paraphrased | keeping a linked list in a slot when two keys land in the same place | linked list collision resolution · hash table chaining method | results | L7@13:58, L8@2:44, L8@53:09 | yes |
| T-PA-06 | paraphrased | choosing the hash function at random so an adversary cannot pick bad keys | random hash function selection · adversary resistant key selection | results | L8@4:15, L8@19:16, L8@9:45 | yes |
| T-PA-07 | paraphrased | computing x to the power n with fewer multiplications | exponentiation by squaring · efficient power computation | results | L3@14:00, L3@13:00, L3@43:44 | yes |
| T-PA-08 | paraphrased | laying out a complete binary tree on a chip using little area | complete binary tree layout · chip area optimization for binary trees | results | L3@55:58, L10@3:27, L10@2:15 | yes |
| T-PA-09 | paraphrased | finding the k-th smallest element quickly with a random pivot | k-th smallest element · random pivot selection | results | L6@11:29, L6@53:15, L4@53:35 | yes |
| T-PA-10 | paraphrased | restructuring a search tree locally without breaking the ordering | local restructuring of search tree · maintaining order in search tree | results | L9@2:13, L10@1:32, L10@32:15 | **no** |
| T-PA-11 | paraphrased | drawing out the cost at every level of the recursion and adding it up | cost analysis of recursion · total cost at each recursion level | results | L2@49:44, L1@1:12:43, L2@1:02:01 | **no** |
| T-PA-12 | paraphrased | why inserting keys into a search tree in random order is like quicksort | inserting keys into search tree · random order quicksort comparison | results | L9@18:45, L4@46:46, L4@48:14 | **no** |
| T-ZH-01 | zh_mixed | 主定理怎么用 | Master theorem application · Using the master theorem | results | L2@56:45, L2@51:16, L2@26:47 | yes |
| T-ZH-02 | zh_mixed | 快速排序的期望运行时间 | expected runtime of quicksort · quicksort average case analysis | results | L5@2:43, L4@1:19:01, L9@17:16 | **no** |
| T-ZH-03 | zh_mixed | 比较排序的下界是多少 | lower bound of comparison sorting · comparison sorting lower bound | results | L5@20:00, L5@26:45, L5@4:43 | yes |
| T-ZH-04 | zh_mixed | 计数排序是怎么工作的 | How does counting sort work? · Counting sort algorithm explanation | results | L5@1:13:45, L5@1:04:15, L5@1:03:00 | **no** |
| T-ZH-05 | zh_mixed | 红黑树的旋转操作 | Red-black tree rotation operation · Rotation operations in red-black trees | results | L10@36:15, L10@1:21:31, L10@1:19:32 | yes |
| T-ZH-06 | zh_mixed | 哈希冲突用链表解决 | hash collision resolution · linked list for hash collisions | results | L8@53:31, L7@14:27, L8@11:14 | yes |
| T-ZH-07 | zh_mixed | 如何在线性时间内找到中位数 | find median in linear time · median finding algorithm | results | L6@3:34 | **no** |
| T-ZH-08 | zh_mixed | 随机二叉搜索树的期望高度 | expected height of random binary search tree · average height of binary search tree | results | L9@24:59, L9@1:18:01, L9@56:32 | yes |
| T-ZH-09 | zh_mixed | master theorem 的三种情况 | three cases of master theorem · master theorem scenarios | results | L2@56:45, L4@45:15, L2@51:16 | yes |
| T-ZH-10 | zh_mixed | quicksort 的 partition 怎么做 | quicksort partition method · how to perform quicksort partition | results | L4@4:44, L4@15:56, L9@12:25 | yes |
| T-ZH-11 | zh_mixed | universal hashing 是什么意思 | What is universal hashing? · Definition of universal hashing | results | L8@53:00, L8@19:16, L8@0:09 | **no** |
| T-ZH-12 | zh_mixed | Strassen 算法为什么只需要七次乘法 | Strassen algorithm multiplication count · Why Strassen requires seven multiplications | results | L3@42:44, L3@48:25, L3@54:00 | yes |
| T-NF-01 | not_covered | Dijkstra's shortest path algorithm | Dijkstra's algorithm · shortest path algorithm | results | L5@18:29, L6@1:03:45 | **no** |
| T-NF-02 | not_covered | dynamic programming for longest common subsequence | dynamic programming · longest common subsequence | results | L1@1:07:45 | **no** |
| T-NF-03 | not_covered | how photosynthesis works in plants | photosynthesis process in plants · mechanism of photosynthesis | not_found | — | yes |
| T-NF-04 | not_covered | causes of the French Revolution | causes of French Revolution · factors leading to French Revolution | not_found | — | yes |
| T-NF-05 | not_covered | 如何训练神经网络 | how to train neural networks · neural network training techniques | not_found | — | yes |
| T-NF-06 | not_covered | greedy algorithm for minimum spanning trees | greedy algorithm minimum spanning tree · minimum spanning tree algorithm | results | L10@32:15, L5@16:13, L3@56:15 | **no** |
| T-NF-07 | not_covered | TCP congestion control | TCP congestion control mechanisms · TCP congestion avoidance techniques | not_found | — | yes |
| T-NF-08 | not_covered | 供求关系如何决定价格 | Supply and demand determine price · Price determination by supply and demand | not_found | — | yes |
| T-AS-01 | assessment | solve question 2 of assignment 1 | — | refused | — | yes |
| T-AS-02 | assessment | give me the answer to problem set 3 problem 4 | — | refused | — | yes |
| T-AS-03 | assessment | 帮我做作业第二题 | — | refused | — | yes |
| T-AS-04 | assessment | 作业1第3题的答案是什么 | — | refused | — | yes |
| T-AS-05 | assessment | write the code for my homework on red-black trees | — | refused | — | yes |
| T-AS-06 | assessment | quiz 1 question 5 master theorem 的答案 | — | refused | — | yes |
