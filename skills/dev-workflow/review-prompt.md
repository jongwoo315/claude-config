# Review session — instructions

> **For Claude:** You are a REVIEW session dispatched by `orch` into a worktree whose
> implementation is already finished, committed, pushed, and has an open PR. You did NOT write
> this code. Do NOT switch branches, do NOT create a worktree, do NOT use AskUserQuestion or any
> interactive prompt — the session is headless and cannot receive input. Take the autonomous
> default and keep working. Do NOT use `superpowers:executing-plans` or
> `subagent-driven-development`.
>
> Emit `<promise>REVIEW_DONE</promise>` ONLY when the review file exists with every finding
> dispositioned AND every `fix` commit is pushed. Never to escape the loop.
>
> On a HARD, retry-proof API error (401/403, `insufficient_quota`, exhausted billing), STOP —
> do not emit the promise, do not spin. A TRANSIENT error that stops being transient counts as
> HARD: if 429/529 keeps surfacing AND you have produced no commit and no file change for 20
> minutes, STOP the same way.

## Scope

**Review only. Do not implement new features, do not refactor beyond a finding, do not touch
anything outside `main...HEAD`.** The implementation is done; your job is to find what it got
wrong and dispose of each finding.

**Never post to GitHub.** No `gh pr review`, no `gh api .../comments`, no PR comments of any
kind. The review lives in a file; a human decides whether any of it reaches GitHub. This is not
a style preference — posting is a human-gated action (`ops:github-pr-review` §5).

## 1. Establish the target

```bash
gh pr view --json number,title,url,headRefName,baseRefName
git log --oneline "$(gh pr view --json baseRefName -q .baseRefName)"..HEAD
git diff --stat "$(gh pr view --json baseRefName -q .baseRefName)"...HEAD
```

Read the plan (`docs/plans/<ID>-MMDD-plan-<topic>.md`) — its **통과 기준**, **이번에 안 하는 것**,
and **실패 징후** are the standard the diff is measured against. A finding that the code does not
meet its own plan outranks any generic code smell.

## 2. Review

Run `pr-review-toolkit:review-pr` over the diff, all aspects. Do NOT run the built-in
`/code-review` — it is a human-typed command and is absent from a headless session's skill list;
calling it burns iterations looking for a skill that is not there.

Weigh findings by the plan first, then by correctness, then by everything else.

## 3. Write the review file

`docs/plans/<ID>-MMDD-review-<short-topic>.md` — same naming rule as every other plans file
(`type` before `topic`, `MMDD`, topic ≤20 chars / ≤4 words).

```markdown
# <ID> 리뷰 — PR #<n>

**대상:** `<base>...HEAD` — <n> commits, <a> files, +<x> −<y>
**plan:** docs/plans/<ID>-MMDD-plan-<topic>.md

## 지적

| # | 심각도 | 위치 | 내용 | 처리 |
| --- | --- | --- | --- | --- |
| 1 | Critical | `path/to/file.py:88` | <한 문장> | fix `abc1234` |
| 2 | Important | `path/to/other.py:12` | <한 문장> | push-back — <이유> |
| 3 | Suggestion | `path/to/x.py:40` | <한 문장> | 기록만 |

## plan 대조

| plan 기준 | 코드가 만족하나 | 증거 |
| --- | --- | --- |
| <통과 기준 문장 그대로> | 예 / 아니오 / 판정 불가 | `file:line` · 커밋 · 수치 |
```

**처리 값은 다섯 개뿐이다:** `fix <해시>` · `push-back — <이유>` · `defer — <이유>` ·
`won't-fix — <이유>` · `기록만`. 빈칸을 남기지 말 것.

`plan 대조` 표에서 **기계적으로 확인되는 것만 `예`로 적는다.** 테스트 통과·파일 존재·컬럼 추가는
가능하고, "precision이 baseline보다 낫다" 같은 것은 값만 적고 판정하지 않는다 — 그 판정은
사람 몫이다 (`rules/judgment-log.md`).

## 4. 리뷰처리 (fix)

Critical과 Important만 고친다. Suggestion은 기록만.

1. 지적 하나를 고친다 → 그 지적이 건드린 파일만 `git add` → 커밋 하나.
   **여러 지적을 한 커밋에 묶지 않는다.**
2. 커밋 메시지는 무엇을 왜 고쳤는지 한국어 한 줄.
3. 단축 해시(7자)를 그 행의 `처리` 칸에 적는다.
4. 전부 처리한 뒤 `git push` **한 번만**.
5. 테스트를 다시 돌려 green을 확인한다. 못 돌리면 그 사실을 리뷰 파일 맨 아래에 적는다.

고치지 않기로 한 것은 이유를 적는다. **조용한 skip 금지** — 지적을 지우지 말고 `push-back`이나
`won't-fix`로 남긴다. 지운 지적은 사람이 판정할 기회가 사라진다.

## 5. 마지막

리뷰 파일을 커밋하고 push한 뒤 `<promise>REVIEW_DONE</promise>`.
