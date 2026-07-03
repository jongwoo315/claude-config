# Algorithm Patterns for Backend Interview

## Pattern Catalog (우선순위순)

### Tier 1: 필수 (코딩테스트 60%+ 커버)

| Pattern | Key Problems | Frequency |
|---------|-------------|-----------|
| hash-map | Two Sum, Group Anagram, Subarray Sum | 매우 높음 |
| two-pointer | 3Sum, Container With Water, Palindrome | 높음 |
| sliding-window | Max Subarray, Min Window Substring | 높음 |
| binary-search | Search Rotated Array, Koko Banana | 높음 |
| bfs-dfs | Island Count, Tree Traversal, Shortest Path | 매우 높음 |
| stack-queue | Valid Parentheses, Daily Temperature | 중간 |

### Tier 2: 중요 (코딩테스트 25% 커버)

| Pattern | Key Problems | Frequency |
|---------|-------------|-----------|
| dp-basic | Climbing Stairs, House Robber, Coin Change | 높음 |
| dp-2d | Unique Paths, LCS, Edit Distance | 중간 |
| greedy | Activity Selection, Jump Game | 중간 |
| backtracking | Permutations, N-Queens, Sudoku | 중간 |
| heap | Top K Frequent, Merge K Lists | 중간 |

### Tier 3: 심화 (Google/네이버 급)

| Pattern | Key Problems | Frequency |
|---------|-------------|-----------|
| graph-advanced | Dijkstra, Topological Sort, Union Find | 중간 |
| trie | Autocomplete, Word Search II | 낮음 |
| segment-tree | Range Query, Interval Problems | 낮음 |
| dp-advanced | Knapsack, Bitmask DP | 낮음 |

## Company-Specific Focus

| Company | Primary Patterns | Style |
|---------|-----------------|-------|
| Toss | hash-map, dp, greedy, implementation | 프로그래머스, 실무 구현 |
| KakaoBank | bfs-dfs, dp, string, simulation | 카카오 기출 변형 |
| Musinsa | implementation, hash-map, sorting | 실무 구현 중심 |
| Google | all Tier 1-3, system design coding | LeetCode Medium-Hard |

## Session Structure

1. **패턴 설명** — 핵심 아이디어, 시간/공간 복잡도, 적용 시그널
2. **대표 문제** — 패턴 대표 문제 1개 (Java 기준, Kotlin 선택 가능)
3. **사용자 풀이** — 직접 작성
4. **리뷰** — 시간복잡도 분석, 개선점, Python과 구현 차이
5. **변형 문제** — 난이도 올린 변형 1개
6. **정리** — 패턴 적용 판단 기준 요약

## Difficulty Progression (6개월)

| Month | Target | Daily |
|-------|--------|-------|
| 3 | Tier 1 완성, 백준 실버-골드 | 1-2문제 |
| 4 | Tier 2 시작, LeetCode Medium | 1-2문제 |
| 5 | Tier 2 완성 + Tier 3 시작 | 1-2문제 (약점 집중) |
| 6 | 실전 모의, 시간 제한 연습 | 모의 코테 주 1회 |
