# Custom Instructions

## 개발 작업

- 개발 작업(기능·버그·리팩터링) 시작 → **`dev-workflow` 스킬**. 파이프라인·게이트·orch 운용·
  티켓 프로퍼티·`docs/plans` 파일 규칙이 전부 거기 있다.
- **판단 기록은 `rules/judgment-log.md`** — 판단 로그(PR 게이트)와 문제 발견(상시). 스킬을
  호출하지 않아도 발동하므로 rules에 둔다.

**Pre-PR 필수 체크 (skip 불가):** 환경변수 점검(`.env.example` 대비 diff) · 로컬 서버 기동 ·
전체 테스트 통과. 무인 실행에서 쓰는 구체 명령(백그라운드+timeout, `BOOT_OK`, 무테스트 시
명시)은 `dev-workflow` 스킬의 Pre-PR 블록이 정본이다.

## Git Commit Preferences

- Keep commit messages clean and concise
- Use korean when creating commit messages

## 기술 결정 기록

- 프레임워크, 라이브러리, 아키텍처 등 A vs B 선택 시 **"왜 A를 선택했는지"** 근거를 반드시 명시할 것
- 중요한 기술 결정은 `/tdr`로 Notion에 기록 (면접 준비용 Q&A 포함)

## Personal Projects (~/prv/)

Personal task tracking: Notion 프로젝트 진행 DB (`29241e61-65c0-801f-9529-cabf8cad919b`)

## TODO

- [x] GitHub에 claude-config 레포 생성 → `~/.claude` 자체가 repo (https://github.com/jongwoo315/claude-config, **public**, 2026-07-29 전환)
- [x] DB 접속 정보를 환경변수로 분리 (2026-07-29) — `~/.zshenv`의 `PLAB_*`.
      **저장소가 public이므로 자격증명·업무 식별자를 커밋하지 말 것.**
      heredoc `<< 'EOF'`는 변수를 확장하지 않는다 → `printf '%s'` 사용.
- [ ] DB 자격증명을 IAM 임시 자격증명으로 전환 (현재 `~/.zshenv`에 평문, ISMS 2.5.1)
- [x] sync test → work mac 양방향 동기화 확인 (2026-07-03)

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
2. **Claude Read/Grep** — exact line numbers needed for editing, or small files

Never use Read/Grep when code-review-graph can answer the question.

@RTK.md
