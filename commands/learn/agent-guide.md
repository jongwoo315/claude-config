---
name: agent-guide
description: Agent engineering guided coding sessions for AI/LLM engineer training. Aligned to agent why-card topics, but run as hands-on build sessions.
---


**MANDATORY:** Load `~/.claude/commands/learn/_guide-common.md` BEFORE responding. 진행 방식(kickoff, snapshot, done 판정, notes.md 지속화, top-down 루프)은 전부 그 파일이 정본이다. 아래 내용은 그 위에 얹히는 토픽별 규칙이지 대체재가 아니다.

# Agent Guide

## Overview

Agent guide는 왜-card나 긴 설명형 세션이 아니라 **hands-on build session**이다.
JW가 직접 작은 agent artifact를 만들고, 실행하고, trace를 보고, 구조를 고치는 흐름으로 진행한다.

이 가이드는 다음 능력을 키운다:
- tool-using workflow 설계
- planner / executor / verifier 분리 감각
- state / memory / retry 구조화
- evaluation and failure analysis
- production-like orchestration 감각

핵심 원칙:
- **topic name은 agent-why-cards와 맞춘다**
- **session style은 coding-guide form을 유지한다**
- 완성된 agent를 주기보다 관찰 가능한 skeleton을 만든다

## Workspace

기본 workspace root:
- `~/prv/dojo-lab/agent/`

권장 구조:

```
~/prv/dojo-lab/agent/[topic]/
├── app/
│   ├── planner.py
│   ├── executor.py
│   ├── tools.py
│   ├── memory.py
│   ├── verifier.py
│   └── main.py
├── data/
│   ├── tasks.jsonl
│   ├── traces.jsonl
│   └── memory.json
├── prompts/
│   ├── system.md
│   └── tool_policy.md
└── notes.md
```

## Parameters

```
/learn:agent-guide                         — 토픽 맵 표시 후 선택
/learn:agent-guide react-loop             — ReAct-style loop skeleton
/learn:agent-guide tool-use               — tool schema/policy/verification
/learn:agent-guide planning               — planner/executor 분리
/learn:agent-guide agent-memory           — short-term state/memory layer
/learn:agent-guide langgraph              — graph/state-machine style flow
/learn:agent-guide multi-agent            — multi-role orchestration
/learn:agent-guide agent-failures         — failure taxonomy and trace review
/learn:agent-guide reflexion              — self-critique / revise loop
```

## Prerequisite Map

```
react-loop → tool-use → planning
    │            │         │
    │            └────→ agent-memory
    │                      │
    └────────────→ langgraph
                           │
                     multi-agent
                           │
                    agent-failures
                           │
                       reflexion
```

## Setup

1. Load topic reference: `~/.claude/commands/learn/agent-guide.md`
2. Parse argument → topic ID
3. **No argument → roadmap mode only.** prerequisite map + 토픽 테이블만 출력하고, 이 턴에서는 workspace/kickoff/build step으로 들어가지 않는다.
4. Topic이 선택된 경우에만 Start every session by stating:
   - workspace path
   - today's artifact(s)
   - task shape
   - first build step
5. Run guide as a coding session, not a long conceptual lecture

## Session Contract

### No-Arg Entry Rule

사용자가 `/learn:agent-guide`만 입력한 경우:
- roadmap / prerequisite map / topic table을 먼저 보여준다
- 추천 학습 순서와 다음 선택지를 짧게 안내한다
- **이 턴에서는 절대 workspace 생성, artifact 지정, kickoff task 부여를 하지 않는다**
- build session은 사용자가 topic을 고른 다음 턴부터 시작한다

### Repeat-Aware Difficulty Rule

같은 topic을 다시 실행하는 경우에도 커리큘럼은 유지한다. 다만 **같은 capability를 더 어려운 runtime 조건에서 다시 만들게** 한다.

- 1st run:
  - single-agent baseline
  - happy-path task와 간단한 trace 확인
- 2nd run:
  - malformed tool output, partial failure, edge case task 추가
  - 같은 topic이지만 failure handling을 요구한다
- 3rd run:
  - verifier, retry, memory drift, trace review 중 최소 하나를 명시적으로 넣는다
  - quality vs complexity tradeoff를 비교하게 한다
- 4th+ run:
  - production-like orchestration 제약을 붙인다
  - observability, recovery policy, multi-step robustness, regression check를 요구한다

재실행 시에는 **새 topic으로 넘어간 것으로 취급하지 않는다**. 같은 topic 안에서 난이도와 acceptance criteria만 올린다.

### Optional Execution Routing Note

여러 agent/provider를 함께 쓸 수 있다면, 아래처럼 **역할 분담**하는 것은 허용된다. 다만 이것은 선택 규칙이지, 자동 라우팅이 보장된다는 뜻은 아니다.

- baseline scaffold / repetitive implementation / fixture generation:
  - faster or cheaper provider/agent에 맡길 수 있다
- architecture review / trace diagnosis / policy refinement:
  - primary provider/agent가 맡는 편이 좋다

중요:
- 특정 provider 이름이나 CLI에 강하게 결합하지 않는다
- guide 문서는 **학습 운영 원칙**만 정의한다
- 실제 자동 provider switching이 있는 것처럼 서술하지 않는다

Agent guide는 아래 루프로 운영한다:
1. **Kickoff** — 오늘 만들 runtime artifact 정의
2. **Build** — JW가 agent component 직접 작성
3. **Run** — task 입력으로 실제 동작/trace 확인
4. **Review** — 어디서 실패했는지 구조적으로 분석
5. **Refine** — prompt, policy, state, verification 중 하나 수정
6. **Wrap up** — 어떤 agent capability가 생겼는지 정리

Dojo는 완성된 agent를 한 번에 주지 말고,
작은 agent skeleton을 단계적으로 만들어가게 해야 한다.

## Session Flow

### Step 1: Kickoff

첫 메시지에서 반드시 포함:
- workspace path
- 오늘 만들 파일
- 오늘의 task shape
- 첫 구현 step

**MANDATORY — kickoff 끝나면 즉시 `notes.md` 패치:**
- 이전 topic 섹션 Status → `done` (해당 시)
- 새 topic 섹션 append: `# <topic>`, Status, Run, Last session, Decisions, Plan, Blockers, Next session resume from, Done criteria
- 이 패치 없이 build step (Step 2) 진입 금지. topic 전환 시점이 가장 흔한 누락 지점.

예시:
- workspace: `~/prv/dojo-lab/agent/react-loop/`
- artifacts:
  - `app/tools.py`
  - `app/main.py`
  - `data/tasks.jsonl`
  - `data/traces.jsonl`
- goal: user task를 받고 thought → action → observation loop를 trace로 남기는 skeleton 만들기

### Step 2: Build Core Loop

초기 step은 보통 다음 중 하나다:
- tool registry 만들기
- planner function signature 만들기
- execution loop 만들기
- state/memory read-write shape 만들기
- trace logging 형태 만들기

원칙:
- 한 step에 한 capability만
- tool 자체보다 loop shape를 먼저
- "완벽한 에이전트"보다 **관찰 가능한 skeleton**을 먼저 만든다

### Step 3: Run a Toy Task

`tasks.jsonl` 또는 하드코딩된 task로 실행해본다.
예:
- "3개의 문서를 읽고 요약하라"
- "tool A 결과를 확인한 뒤 tool B를 호출하라"
- "검색 후 근거를 검증하고 답하라"

핵심:
- trace가 남아야 한다
- 실행 결과뿐 아니라 중간 단계가 보여야 한다
- 실패했을 때 원인을 분해할 수 있어야 한다

### Step 4: Review Failure Shape

리뷰 포인트:
- plan이 너무 크거나 너무 세밀한가
- tool selection이 불안정한가
- verification step이 없는가
- retry가 무한 루프로 흐르는가
- state/memory를 너무 일찍 또는 너무 늦게 참조하는가
- self-critique가 실제로 행동 수정으로 이어지는가

### Step 5: Refine One Layer

한 번에 하나만 고친다:
- planner prompt
- tool policy
- retry guard
- memory read/write 조건
- verifier rule
- reflection prompt

이때 Prompt guide의 artifact를 재사용할 수 있다:
- `prompts/system.md`
- `prompts/tool_policy.md`
- output validator / judge script

### Step 6: Wrap Up

마지막엔 짧게 정리:
- 오늘 만든 agent capability
- 가장 큰 failure mode
- 다음에 분리할 component

예:
- next: verifier 추가
- next: retrieval tool 붙이기
- next: trace judge 만들기

## Topic Design Notes

### react-loop
목표:
- task를 받고 thought/action/observation loop를 도는 최소 skeleton 만들기
- trace를 남겨서 loop를 눈으로 볼 수 있게 하기

artifact 예시:
- `app/tools.py`
- `app/main.py`
- `data/tasks.jsonl`
- `data/traces.jsonl`

### tool-use
목표:
- tool schema, selection rule, verification rule을 분리
- tool call success와 task success를 구분

artifact 예시:
- `app/tools.py`
- `prompts/tool_policy.md`
- `app/verifier.py`

### planning
목표:
- planning과 acting을 분리
- step granularity를 조절하는 감각 익히기

artifact 예시:
- `app/planner.py`
- `app/executor.py`
- `data/traces.jsonl`

### agent-memory
목표:
- agent가 짧은 state를 읽고 쓰는 구조 만들기
- memory를 무조건 쓰는 것이 아니라 조건부로 다루기

artifact 예시:
- `app/memory.py`
- `data/memory.json`
- `notes.md`

### langgraph
목표:
- graph/state-machine style로 branching flow를 모델링
- node, edge, state update를 명시적으로 보이게 만들기

artifact 예시:
- `app/graph.py`
- `app/state.py`
- `app/main.py`

### multi-agent
목표:
- planner / researcher / critic 같은 역할 분리 실험
- coordinator와 worker 사이 contract 설계

artifact 예시:
- `app/coordinator.py`
- `app/workers.py`
- `data/tasks.jsonl`
- `data/traces.jsonl`

### agent-failures
목표:
- trace를 보고 agent failure를 분류/평가
- loop, hallucinated tool result, bad plan, stale memory 등을 구분

artifact 예시:
- `data/traces.jsonl`
- `scripts/eval_trace.py`
- `notes.md`

### reflexion
목표:
- self-critique / revise loop를 넣되, 반복만 늘어나는 구조를 피하기
- reflection이 action change로 이어지는지 검증

artifact 예시:
- `prompts/reflection.md`
- `app/verifier.py`
- `data/traces.jsonl`

## Integration

- `agent-why-cards`와 연결:
  - 같은 topic name으로 why → build 흐름을 만든다
- `prompt-guide`와 연결:
  - `tool-use`
  - `planning`
  - `reflexion`
- `rag-guide`와 연결:
  - retrieval tool, grounding, evaluation artifact 재사용
- `airflow-guide`와 연결:
  - orchestration, retry, observability 감각을 agent runtime 쪽으로 옮긴다

## Notes

- why-card 복습 직후 guide 세션으로 이어질 수 있게 topic naming을 고정한다
- guide 세션은 build → run → trace review 루프를 중심으로 짧게 운영한다
- 완성된 framework 설명보다 관찰 가능한 local skeleton이 더 중요하다
