---
name: prompt-guide
description: Prompt engineering guided coding sessions for AI/LLM engineer training. Aligned to prompt why-card topics, but run as artifact-building night coding sessions.
---

# Prompt Guide

## Overview

Prompt guide는 why-card보다 깊고, 설명형 세션보다 더 실전적인 **night coding session**이다.
JW가 Mac mini에서 직접 파일을 만들고, 프롬프트를 수정하고, eval 데이터를 만들고, 작은 validator/judge를 돌리면서 배우는 흐름으로 진행한다.

이 가이드는 단순히 개념을 설명하는 것이 아니라:
- prompt variant를 직접 작성하고
- failure case를 수집하고
- eval set을 만들고
- lightweight validator/judge로 반복 실험 루프를 만든다

핵심 원칙:
- **topic name은 prompt-why-cards와 맞춘다**
- **session style은 coding-guide form을 유지한다**
- 이론보다 artifact와 feedback loop를 우선한다

## Workspace

기본 workspace root:
- `~/prv/dojo-lab/prompt/`

각 토픽은 보통 아래 구조를 사용한다:

```
~/prv/dojo-lab/prompt/[topic]/
├── prompts/
│   ├── baseline.md
│   ├── variant_a.md
│   └── variant_b.md
├── data/
│   ├── eval_cases.jsonl
│   └── failures.jsonl
├── scripts/
│   ├── run_eval.py
│   ├── validate_output.py
│   └── judge.py
└── notes.md
```

## Parameters

```
/learn:prompt-guide                         — 토픽 맵 표시 후 선택
/learn:prompt-guide system-prompt          — system prompt 구조화
/learn:prompt-guide role-prompting         — role/persona 지시 비교
/learn:prompt-guide few-shot               — few-shot example 설계
/learn:prompt-guide chain-of-thought       — reasoning scaffold 설계
/learn:prompt-guide zero-shot-cot          — zero-shot CoT 유도와 비교
/learn:prompt-guide structured-output      — schema/format discipline
/learn:prompt-guide temperature            — sampling 설정과 variance 관찰
/learn:prompt-guide prompt-injection       — injection 방어 prompt 실험
```

## Prerequisite Map

```
system-prompt → role-prompting → few-shot
       │               │             │
       └──────→ structured-output ←──┘
                       │
            chain-of-thought → zero-shot-cot
                       │
                  temperature
                       │
               prompt-injection
```

## Setup

1. Load topic reference: `~/.claude/commands/learn/prompt-guide.md`
2. Parse argument → topic ID
3. **No argument → roadmap mode only.** prerequisite map + 토픽 테이블만 출력하고, 이 턴에서는 workspace/kickoff/build step으로 들어가지 않는다.
4. Topic이 선택된 경우에만 Start every session by stating:
   - workspace path
   - today's artifact(s)
   - success criteria
   - first coding step
5. Treat the session as build-oriented. Avoid long theory dumps.

## Session Contract

### No-Arg Entry Rule

사용자가 `/learn:prompt-guide`만 입력한 경우:
- roadmap / prerequisite map / topic table을 먼저 보여준다
- 추천 학습 순서와 다음 선택지를 짧게 안내한다
- **이 턴에서는 절대 workspace 생성, artifact 지정, kickoff task 부여를 하지 않는다**
- build session은 사용자가 topic을 고른 다음 턴부터 시작한다

### Repeat-Aware Difficulty Rule

같은 topic을 다시 실행하는 경우에도 커리큘럼은 유지한다. 다만 **같은 prompting concept를 더 어려운 input/eval 조건으로 다시 실험하게** 한다.

- 1st run:
  - baseline prompt variants
  - 작은 eval set과 happy-path examples
- 2nd run:
  - adversarial, ambiguous, repeated cases를 추가한다
  - 같은 topic이지만 failure pattern을 더 분명히 보이게 한다
- 3rd run:
  - eval/judge/validator를 붙여 variant 비교를 명시적으로 하게 한다
  - consistency vs flexibility tradeoff를 비교하게 한다
- 4th+ run:
  - production-like constraints를 붙인다
  - schema robustness, injection resistance, regression check, write-up 중 일부를 요구한다

재실행 시에는 **새 topic으로 넘어간 것으로 취급하지 않는다**. 같은 topic 안에서 난이도와 acceptance criteria만 올린다.

### Optional Execution Routing Note

여러 agent/provider를 함께 쓸 수 있다면, 아래처럼 **역할 분담**하는 것은 허용된다. 다만 이것은 선택 규칙이지, 자동 라우팅이 보장된다는 뜻은 아니다.

- repeated eval runs / fixture generation / baseline variant drafting:
  - faster or cheaper provider/agent에 맡길 수 있다
- final prompt judgment / failure analysis / refinement direction:
  - primary provider/agent가 맡는 편이 좋다

중요:
- 특정 provider 이름이나 CLI에 강하게 결합하지 않는다
- guide 문서는 **학습 운영 원칙**만 정의한다
- 실제 자동 provider switching이 있는 것처럼 서술하지 않는다

Prompt guide는 다음 루프로 진행한다:
1. **Kickoff** — 오늘 만들 파일/실험 범위 확정
2. **Build** — JW가 prompt/eval/script 직접 작성
3. **Run** — 간단한 테스트 또는 variant 비교 실행
4. **Review** — failure pattern / prompt tradeoff 점검
5. **Refine** — prompt or validator 수정
6. **Wrap up** — 무엇이 좋아졌는지, 다음 실험은 무엇인지 정리

Dojo는 정답 프롬프트를 통째로 주지 말고,
작은 단계와 리뷰 포인트를 제공해야 한다.

## Session Flow

### Step 1: Kickoff

첫 메시지에서 반드시 포함:
- workspace path
- 오늘 만들 파일
- 성공 기준
- 첫 step

**MANDATORY — kickoff 끝나면 즉시 `notes.md` 패치:**
- 이전 topic 섹션 Status → `done` (해당 시)
- 새 topic 섹션 append: `# <topic>`, Status, Run, Last session, Decisions, Plan, Blockers, Next session resume from, Done criteria
- 이 패치 없이 build step (Step 2) 진입 금지. topic 전환 시점이 가장 흔한 누락 지점.

예시:
- workspace: `~/prv/dojo-lab/prompt/structured-output/`
- artifacts:
  - `prompts/baseline.md`
  - `prompts/variant_schema.md`
  - `data/eval_cases.jsonl`
  - `scripts/validate_output.py`
- goal: 같은 task에 대해 free-form prompt와 schema-enforced prompt를 비교할 수 있게 만들기

### Step 2: Build Prompt Artifacts

JW가 직접 작성할 것:
- baseline prompt
- 바꾸는 축이 하나인 variant
- 필요하면 validator/judge 스크립트 초안

원칙:
- 한 step에 한두 파일만 다룬다
- 프롬프트 전체를 한 번에 완성하려 하지 않는다
- 각 variant는 바꾸는 축을 하나만 분리한다
  - system instruction
  - role framing
  - example set
  - reasoning scaffold
  - output schema
  - safety/injection guard

### Step 3: Build Eval Set

간단한 `eval_cases.jsonl` 작성:

```json
{"id":"1","input":"...","expected":"...","tags":["format"]}
{"id":"2","input":"...","expected":"...","tags":["safety"]}
```

원칙:
- 5~10개면 충분
- 정상 케이스 + 실패 유도 케이스를 섞는다
- `prompt-injection` 토픽에서는 공격성 입력을 꼭 넣는다
- `temperature` 토픽에서는 같은 입력 반복 실험이 가능해야 한다

### Step 4: Run Lightweight Eval

`run_eval.py`, `validate_output.py`, `judge.py`로 다음 중 하나를 구현:
- prompt A/B 출력 비교
- schema 준수 여부 확인
- 금지 표현 포함 여부 확인
- citation/grounding 여부 확인
- same input 반복 결과 variance 기록
- injection 대응 성공 여부 확인

처음엔 완벽한 judge가 아니어도 된다.
핵심은 **실험 루프를 코드로 고정하는 것**이다.

### Step 5: Review

리뷰 포인트:
- 어느 variant가 왜 더 나았는가
- 실패가 prompt 문제인지 task definition 문제인지
- reasoning instruction이 실제로 답 품질을 바꿨는지
- output format instruction이 과한지 부족한지
- safety guard가 실제 공격 입력에서 버텼는지

### Step 6: Wrap Up

마지막엔 짧게 정리:
- 오늘 만든 artifact
- 가장 큰 개선 포인트
- 다음 실험 제안

예:
- next: `few-shot` variant 추가
- next: eval case 3개를 injection 유형으로 확장
- next: validator를 stricter 하게 만들기

## Topic Design Notes

### system-prompt
목표:
- system/user/constraint를 분리한 prompt 파일 작성
- task boundary와 style rule을 명확히 고정

artifact 예시:
- `prompts/system.md`
- `prompts/user_template.md`
- `notes.md`

### role-prompting
목표:
- role framing이 실제 출력 품질에 미치는 영향 비교
- persona를 cosmetic하게 쓰지 않고 행동 규칙으로 연결

artifact 예시:
- `prompts/role_none.md`
- `prompts/role_expert.md`
- `data/eval_cases.jsonl`

### few-shot
목표:
- example pair를 통해 desired behavior를 유도
- 좋은 example과 나쁜 example의 차이를 관찰

artifact 예시:
- `prompts/fewshot_2.md`
- `prompts/fewshot_4.md`
- `data/eval_cases.jsonl`

### chain-of-thought
목표:
- reasoning scaffold가 필요한 작업에서 중간 사고 구조를 유도
- 무조건 길게 생각시키는 것이 아니라 필요한 문제에만 적용

artifact 예시:
- `prompts/reasoning_scaffold.md`
- `data/eval_cases.jsonl`
- `notes.md`

### zero-shot-cot
목표:
- example 없이 reasoning trigger를 주었을 때의 효과 관찰
- `chain-of-thought`와 비교 실험

artifact 예시:
- `prompts/zero_shot_cot.md`
- `prompts/plain_baseline.md`
- `scripts/run_eval.py`

### structured-output
목표:
- structured output instruction 개선
- JSON or markdown row discipline 강제

artifact 예시:
- `prompts/variant_schema.md`
- `scripts/validate_output.py`
- `data/eval_cases.jsonl`

### temperature
목표:
- sampling 값에 따른 일관성/다양성 tradeoff 관찰
- 같은 입력 반복 호출 실험 만들기

artifact 예시:
- `scripts/run_eval.py`
- `data/repeated_cases.jsonl`
- `notes.md`

### prompt-injection
목표:
- injection 공격 입력에 대한 guard prompt 실험
- reveal/refuse/contain 전략 비교

artifact 예시:
- `prompts/baseline.md`
- `prompts/guarded.md`
- `data/injection_cases.jsonl`
- `scripts/judge.py`

## Integration

- `prompt-why-cards`와 연결:
  - 같은 topic name으로 why → build 흐름을 만든다
- `rag-guide`와 연결:
  - `structured-output`
  - `prompt-injection`
  - retrieval answer prompt 품질 개선
- `agent-guide`와 연결:
  - `system-prompt`
  - `role-prompting`
  - `structured-output`

## Notes

- why-card 복습 직후 guide 세션으로 이어질 수 있게 topic naming을 고정한다
- guide 세션은 artifact 중심으로 짧은 step을 반복한다
- 완성된 정답 prompt를 주기보다, 실험 축과 review 질문을 주는 것이 더 중요하다
