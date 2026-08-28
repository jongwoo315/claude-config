# Guide 커맨드 공통 규칙

`/learn:rag-guide` · `/learn:airflow-guide` · `/learn:prompt-guide` · `/learn:agent-guide` ·
`/learn:spring-guide` · `/learn:spring-data-pipeline-guide` 가 공유하는 진행 규칙.
각 guide 커맨드는 자기 토픽 목록과 done 조건만 갖고, 진행 방식은 이 파일을 따른다.

| 커맨드 | 작업 디렉터리 |
| --- | --- |
| `/learn:rag-guide` | `~/prv/dojo-lab/rag/` |
| `/learn:airflow-guide` | `~/prv/dojo-lab/airflow/` |
| `/learn:prompt-guide` | `~/prv/dojo-lab/prompt/` |
| `/learn:agent-guide` | `~/prv/dojo-lab/agent/` |

## 인자 없이 호출했을 때 — kickoff

subtopic 없이 호출되면 바로 코딩 단계 진입 금지. 먼저 **kickoff** 출력:

1. 가이드 family 전체 그림 (간결한 토픽 bullet 또는 prerequisite 맵)
2. workspace 경로
3. 현재 진행 상태 (workspace 실제 파일 기반 snapshot — 아래 "Snapshot 깊이 규칙" 적용)
4. 권장 다음 build 단계 (아래 "Not done 시 next step 규칙" 적용)

좁은 subtopic 동반 시 (예: `/learn:rag-guide chunking`) → 곧바로 오늘 artifact + 첫 코딩 단계.

## Snapshot 깊이 규칙

kickoff 시 dir 나열에 그치지 말 것. 반드시:

1. workspace 안 실제 코드 파일 **읽기** (test, impl, data sample)
2. test ↔ implementation gap 검사 (import 존재? 함수 시그니처 매치? test stub `...` 개수?)
3. Python env 존재 확인 (`venv` / `.venv` / `pyproject.toml` / `requirements.txt`)
4. 진행도 라벨 부여:
   - `not-started` — 파일 없음
   - `in-progress (TDD red)` — test 있음, impl 없음/실패
   - `in-progress (impl partial)` — impl 있음, test 일부 stub 또는 fail
   - `done` — 아래 done 판정 기준 충족

## "Not done" 시 next step 규칙

현재 topic이 `done` 아니면 → kickoff "권장 다음 build 단계"는 **resume current topic이 1순위**.
다른 topic 점프는 2순위 이하.

next step은 추상 topic 이름이 아니라 **구체 액션**으로:

- ❌ "chunking-strategy 진행"
- ✅ "`test_short_text_returns_single_chunk` 통과시키는 `split_text` 최소 구현"

복수 후보 시:

1. resume (구체 액션)
2. prerequisite map 상 다음 topic
3. 병렬 branch topic

## Topic done 판정 기준

각 topic의 구체 done 조건은 해당 `learn:*-guide` skill 문서 참조
(`learn:rag-guide`, `learn:airflow-guide`, `learn:prompt-guide`, `learn:agent-guide`).

Generic 판정 4축 (skill에 명시 없을 때 fallback):

1. **Artifact 존재** — 해당 topic의 핵심 파일 (impl + test + script) 모두 존재
2. **실행 가능** — 핵심 script 또는 test suite 통과
3. **관찰 산출물** — log / eval result / `notes.md` 중 최소 1개 기록
4. **다음 topic prerequisite 충족** — prerequisite map 상 의존 topic이 이 topic 산출물 import 가능

unclear 시 1st run 기준 (`learn:*-guide` skill "Repeat-Aware Difficulty Rule" 참조). 2nd+ run은 같은 topic 더 어려운 조건으로 재실행 (done 판정 유지).

## Plan 지속화

topic 진행 중 plan/step 리스트는 `<workspace>/<topic>/notes.md` 또는 `<workspace>/notes.md` (flat layout)에 기록.
다음 세션 snapshot 시 이 파일 우선 읽어 resume 정확도 올림.

### Update 트리거 (Claude 자동 판단)

| 트리거 | update 내용 |
|---|---|
| Plan 확정 직후 (kickoff 끝) | 새 step 리스트 전체 저장 |
| Step 완료 signal (`done 1`, `done step2`) | 해당 step `[x]` 체크 + 산출물 경로 |
| Plan 변경 (step 추가/삭제/순서) | 변경 부분 patch + 사유 한 줄 |
| Blocker 발견 | "Blockers" 섹션에 증상 + 추정 원인 |
| 세션 wrap-up | 마지막 상태 + 다음 시작점 기록 |

제외: 단순 실험, 힌트 토론, intermediate 시도 — notes.md 더럽히지 말 것.

### Format

```markdown
# <topic>

**Status:** not-started | in-progress (TDD red) | in-progress (impl partial) | done
**Run:** 1st | 2nd | ...
**Last session:** YYYY-MM-DD

## Plan

- [ ] 1. ...
- [ ] 2. ...

## Blockers

(none)

## Next session resume from

step N
```

## Guide loop

`build → run → review → refine`. **explain → quiz 반복 금지** (why-card 영역).

- 단계당 작은 단위 (보통 1 파일 / 1 focused change)
- JW가 직접 코드 작성. Claude는 힌트만 (rules/learning.md 적용)
- 완료 signal: `done 1`, `done step2`, 또는 review용 snippet
- review 통과 후 다음 단계 할당

## Top-Down Mode (기본 적용)

모든 guide 세션은 top-down 구조로 진행. guide 문서를 순서대로 다 배우는 bottom-up이 아니라, **작동하는 시스템을 먼저 만들고 왜 그렇게 만들었는지 설명 가능해지는 것**이 목표.

매크로 루프 (프로젝트 단위):

1. **프로젝트 목표** — jw가 직접 잡음. Claude가 대신 정하지 않음.
2. **세부 목표 / 로드맵** — Claude가 해당 guide 순서(`learn:*-guide`)를 기준으로 **제안**, jw가 승인. 주도권은 jw, Claude는 로드맵 설계 보조자.
3. **사이클당 최소 코드** — 전체 구현 금지. 그날 검증할 **가설 하나만** 돌아가게. Claude skeleton 받아도 됨.
4. **검증 (verify)** — 빠뜨리기 쉬운 핵심 단계. 코드가 의도대로 동작하는지 실제로 확인 (test / 실행 / eval).
5. **이해** — 검증 후 코드 상세를 완벽히 파악. AI 도움 OK, 단 "이해 없이 복붙"은 금지.

→ 다음 세부 목표로 루프. 각 세부 목표 안에서는 기존 `build → run → review → refine` micro 루프 적용.

프로젝트 시작 시 `<workspace>/td-project.md` 생성 (템플릿: `~/.claude/command-scripts/learn/td-project.template.md`). 매크로 진행 상태는 이 파일, 세부 step 상태는 기존 `notes.md`에 기록.

## 종료 시

세션 마무리에 출력:

- 이번에 build 한 것
- 핵심 design tradeoff
- 다음 build 단계 / 다음 토픽

## Why-card과 구분

guide 커맨드 → build 중심. `learn:*-why-cards` → 설명 중심. 혼동 금지.

## Origin

SOUL.md (Hermes Dojo bot) "Guide Mode" 섹션의 Claude Code adapt 버전.
2026-08-28 `rules/guide-mode.md`에서 옮겨 왔다 — 평문 alias(`rag guide ...`)를 없애면서
항상 로드될 이유가 사라졌다.
