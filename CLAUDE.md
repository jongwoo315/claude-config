# Custom Instructions

## Pre-PR 필수 체크리스트

PR 생성 전 반드시 완료할 것 (skip 불가):

1. **환경변수 점검**: `.env.example` 대비 실제 `.env` diff → 이번 작업에서 추가된 키가 누락 없는지 확인
2. **로컬 서버 기동**: 서버 정상 구동 확인
3. **전체 테스트 실행**: 전체 테스트 suite 통과 확인

## Git Commit Preferences

- Keep commit messages clean and concise
- Use korean when creating commit messages

## 기술 결정 기록

- 프레임워크, 라이브러리, 아키텍처 등 A vs B 선택 시 **"왜 A를 선택했는지"** 근거를 반드시 명시할 것
- 중요한 기술 결정은 `/tdr`로 Notion에 기록 (면접 준비용 Q&A 포함)

## Personal Projects (~/prv/)

Personal task tracking: Notion 프로젝트 진행 DB (`29241e61-65c0-801f-9529-cabf8cad919b`)

## TODO

- [ ] GitHub에 claude-config 레포 생성 (`~/prv/claude-config/`)
- [ ] DB 접속 정보를 환경변수로 분리 (현재 ~/.zshrc에 평문)
- [ ] sync test

## Kimi Delegation Tools (Token Saving)

> Ref: https://medium.com/@kunalbhardwaj598/i-was-burning-through-claude-codes-weekly-limit-in-3-days-here-s-how-i-fixed-it-0344c555abda

Use these tools to offload work to Kimi K2.6 instead of consuming Claude tokens. Runs via `opencode` CLI — no separate API key needed.

**설치 위치:** `~/.claude/kimi-tools/` — `~/.local/bin/`에 symlink됨 (`ask-kimi`, `kimi-write`, `extract-chat`). Claude Code bash와 터미널 모두에서 `source` 없이 직접 호출 가능.

### ask-kimi — bulk file reading (MANDATORY 트리거)

**다음 상황에서는 Read/Bash 대신 반드시 ask-kimi를 사용할 것:**

- 파일 크기가 400줄 이상인 경우
- 동시에 3개 이상 파일을 읽어야 하는 경우
- **같은 파일을 offset을 바꿔가며 2회 이상 Read하는 경우** ← 놓치기 쉬운 케이스

위반 시: Read tool을 닫고 ask-kimi로 재시도할 것.

```
ask-kimi --paths <file1> <file2> ... --question "<question>"
```

Returns a structured summary. Use that instead of reading the files yourself.

<!-- Commented out: narrow sweet spot — review overhead may exceed token savings.
     kimi-write requires conscious invocation with no reliable auto-trigger.
     extract-chat has no forced hook so unlikely to be used in practice.

### kimi-write — boilerplate generation

For tests, config files, docstrings, or repetitive patterns:
kimi-write --spec "<what to generate>" --context <reference> --target <output>
Review the output and edit only what needs fixing.

### Documentation workflow (MANDATORY)

**NEVER write documentation directly. Always delegate to kimi.**
extract-chat <session.jsonl> -o /tmp/chat.txt
ask-kimi --paths /tmp/chat.txt docs/architecture.md \
 --question "Read the chat. What doc updates are needed? Give exact edits."
Then apply Kimi's suggestions yourself (tiny token cost).
-->

### When NOT to delegate

- Tasks under ~2000 tokens (overhead isn't worth it)
- Architectural decisions, debugging, safety-critical code
- Anything requiring careful reasoning
- When exact line numbers are needed for editing

## AskUserQuestion 제약

- **옵션 최대 4개** (초과 시 ValidationError). 선택지가 4개를 넘으면 질문을 분리하거나 가장 중요한 4개로 압축할 것.

## MCP Tools: code-review-graph

**IMPORTANT: ALWAYS use code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore the codebase.** The graph is faster, cheaper (fewer tokens), and gives structural context (callers, dependents, test coverage) that file scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool                        | Use when                                               |
| --------------------------- | ------------------------------------------------------ |
| `detect_changes`            | Reviewing code changes — gives risk-scored analysis    |
| `get_review_context`        | Need source snippets for review — token-efficient      |
| `get_impact_radius`         | Understanding blast radius of a change                 |
| `get_affected_flows`        | Finding which execution paths are impacted             |
| `query_graph`               | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes`     | Finding functions/classes by name or keyword           |
| `get_architecture_overview` | Understanding high-level codebase structure            |
| `refactor_tool`             | Planning renames, finding dead code                    |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

### Exploration Priority Order

When exploring code, follow this order — don't skip ahead:

1. **code-review-graph** — structural queries (callers, impact, relationships, tests). Zero file reads.
2. **ask-kimi** — graph can't answer + files are 400+ lines or 3+ simultaneous files
3. **Claude Read/Grep** — exact line numbers needed for editing, or small files

Never use Read/Grep when code-review-graph can answer the question.
Never use Claude Read for large files when ask-kimi can summarize.

@RTK.md
