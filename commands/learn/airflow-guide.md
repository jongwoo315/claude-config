---
name: airflow-guide
description: Apache Airflow guided coding sessions for AI/ML pipeline engineering. Aligned to airflow why-card topics, but run as small DAG-building sessions.
---


**MANDATORY:** Load `~/.claude/commands/learn/_guide-common.md` BEFORE responding. 진행 방식(kickoff, snapshot, done 판정, notes.md 지속화, top-down 루프)은 전부 그 파일이 정본이다. 아래 내용은 그 위에 얹히는 토픽별 규칙이지 대체재가 아니다.

# Airflow Guide

## Overview

Airflow guide는 개념 설명만 하는 세션이 아니라 **workflow coding session**이다.
JW가 직접 작은 DAG 파일을 만들고, operator를 붙이고, trigger/retry 흐름을 설계하면서 배우는 흐름으로 진행한다.

이 가이드는 다음 능력을 키운다:
- DAG 구조 읽기/작성
- Operator 선택과 task boundary 설계
- Trigger Rule, retry, backfill 같은 운영 개념을 코드로 이해
- XCom / Sensor 흐름 이해
- Python script 사고방식과 orchestration 사고방식의 차이를 체감

핵심 원칙:
- **topic name은 airflow-why-cards와 맞춘다**
- 긴 철학 설명보다 **작은 DAG artifact**를 우선한다
- LLM/AI pipeline 예시로 연결하되, 이름은 why-card taxonomy를 따른다

## Workspace

기본 workspace root:
- `~/prv/dojo-lab/airflow/`

권장 구조:

```
~/prv/dojo-lab/airflow/[topic]/
├── dags/
│   └── demo_dag.py
├── plugins/
│   └── helpers.py
├── data/
│   ├── sample_input.json
│   └── run_notes.jsonl
├── tests/
│   └── test_dag.py
└── notes.md
```

## Parameters

```
/learn:airflow-guide                   — 토픽 맵 표시 후 선택
/learn:airflow-guide dag-structure     — DAG 골격과 task graph 만들기
/learn:airflow-guide operator          — Operator / TaskFlow task 설계
/learn:airflow-guide trigger-rule      — branching, skip, trigger rule 이해
/learn:airflow-guide sensor            — 외부 이벤트 대기 task 설계
/learn:airflow-guide xcom              — XCom, Connection, Hook 흐름
/learn:airflow-guide retry             — retry / timeout / SLA / 관측성
/learn:airflow-guide backfill          — 재실행, catchup, historical runs 다루기
```

## Prerequisite Map

```
dag-structure → operator → trigger-rule
      │             │            │
      │             └──────→ xcom
      │                          │
      └──────────────→ sensor    │
                                 │
                            retry
                                 │
                              backfill
```

## Setup

1. Load topic reference: `~/.claude/commands/learn/airflow-guide.md`
2. Parse argument → topic ID
3. **No argument → roadmap mode only.** prerequisite map + 토픽 테이블만 출력하고, 이 턴에서는 workspace/kickoff/build step으로 들어가지 않는다.
4. Topic이 선택된 경우에만 Start every session by stating:
   - workspace path
   - today's DAG artifact(s)
   - runtime scenario
   - first coding step
5. Keep the session code-first. Theory should support the file being built.

## Session Contract

### No-Arg Entry Rule

사용자가 `/learn:airflow-guide`만 입력한 경우:
- roadmap / prerequisite map / topic table을 먼저 보여준다
- 추천 학습 순서와 다음 선택지를 짧게 안내한다
- **이 턴에서는 절대 workspace 생성, artifact 지정, kickoff task 부여를 하지 않는다**
- build session은 사용자가 topic을 고른 다음 턴부터 시작한다

### Repeat-Aware Difficulty Rule

같은 topic을 다시 실행하는 경우에도 커리큘럼은 유지한다. 다만 **같은 orchestration concept를 더 어려운 운영 조건으로 다시 다루게** 한다.

- 1st run:
  - readable DAG skeleton
  - happy-path dependency flow
- 2nd run:
  - branch/skip/retry edge cases 추가
  - 같은 topic이지만 failure path와 운영 실수를 다루게 한다
- 3rd run:
  - catchup/backfill/idempotency/observability 중 최소 하나를 명시적으로 넣는다
  - correctness vs operational complexity tradeoff를 비교하게 한다
- 4th+ run:
  - production-like constraints를 붙인다
  - debugging, alerting, dependency failure analysis, regression check를 요구한다

재실행 시에는 **새 topic으로 넘어간 것으로 취급하지 않는다**. 같은 topic 안에서 난이도와 acceptance criteria만 올린다.

### Optional Execution Routing Note

여러 agent/provider를 함께 쓸 수 있다면, 아래처럼 **역할 분담**하는 것은 허용된다. 다만 이것은 선택 규칙이지, 자동 라우팅이 보장된다는 뜻은 아니다.

- boilerplate DAG drafting / repetitive test fixture generation:
  - faster or cheaper provider/agent에 맡길 수 있다
- DAG review / failure analysis / operational refinement:
  - primary provider/agent가 맡는 편이 좋다

중요:
- 특정 provider 이름이나 CLI에 강하게 결합하지 않는다
- guide 문서는 **학습 운영 원칙**만 정의한다
- 실제 자동 provider switching이 있는 것처럼 서술하지 않는다

Airflow guide는 아래 루프로 운영한다:
1. **Kickoff** — 오늘 만들 DAG / operator / retry artifact 정의
2. **Build** — JW가 DAG 코드 직접 작성
3. **Run Mentally or Locally** — task flow를 따라가며 실행 shape 점검
4. **Review** — dependency, trigger, retry, state 관점 리뷰
5. **Refine** — DAG structure 또는 operator 설정 수정
6. **Wrap up** — 어떤 orchestration capability가 생겼는지 정리

Dojo는 Airflow 전체 boilerplate를 통째로 주기보다,
핵심 task flow를 먼저 세우게 해야 한다.

## Session Flow

### Step 1: Kickoff

첫 메시지에서 반드시 포함:
- workspace path
- 오늘 만들 파일
- 파이프라인 시나리오
- 첫 구현 step

**MANDATORY — kickoff 끝나면 즉시 `notes.md` 패치:**
- 이전 topic 섹션 Status → `done` (해당 시)
- 새 topic 섹션 append: `# <topic>`, Status, Run, Last session, Decisions, Plan, Blockers, Next session resume from, Done criteria
- 이 패치 없이 build step (Step 2) 진입 금지. topic 전환 시점이 가장 흔한 누락 지점.

예시:
- workspace: `~/prv/dojo-lab/airflow/trigger-rule/`
- artifacts:
  - `dags/demo_dag.py`
  - `tests/test_dag.py`
  - `notes.md`
- goal: ingest → validate → branch(success/fixup) → publish 흐름에서 trigger rule이 보이는 DAG skeleton 만들기

### Step 2: Build Core DAG Artifact

초기 step은 보통 다음 중 하나다:
- DAG context / decorator 만들기
- task 함수 2~3개 만들기
- operator 하나 붙이기
- dependency chain 또는 branching 연결하기
- retry / timeout / SLA 값 추가하기

원칙:
- 한 step에 task 몇 개만 만든다
- 전체 production DAG보다 **읽을 수 있는 skeleton**을 먼저 만든다
- Python 함수와 orchestration metadata를 분리해서 보이게 한다

### Step 3: Run the Flow on Paper

실제 실행 대신 먼저 흐름을 설명하게 한다:
- 어떤 task가 먼저 도는가
- 어떤 output이 다음 task로 넘어가는가
- 실패 시 어디서 retry 되는가
- skip/branch는 어떻게 동작하는가
- backfill 시 같은 DAG가 어떻게 다시 실행되는가

필요하면 간단한 local test를 만든다:
- import가 되는지
- DAG object가 생성되는지
- task id/dependency가 기대대로인지

### Step 4: Review Failure Shape

리뷰 포인트:
- task boundary가 너무 크거나 작은가
- dependency가 암묵적인가 명시적인가
- operator가 task 내용에 비해 과한가
- XCom이 과하게 무거운 데이터를 싣는가
- sensor가 polling 비용을 키우는가
- retry rule이 business failure와 infra failure를 구분하는가
- backfill 시 중복 처리 위험이 있는가

### Step 5: Refine One Layer

한 번에 하나만 고친다:
- DAG/task structure
- operator choice
- trigger rule / branching rule
- XCom payload shape
- sensor strategy
- retry / SLA / alert config
- catchup/backfill safety note

### Step 6: Wrap Up

마지막엔 짧게 정리:
- 오늘 만든 orchestration artifact
- 가장 큰 failure mode
- 다음에 붙일 운영 기능

예:
- next: XCom 대신 external storage로 바꾸기
- next: retry rule 세분화
- next: backfill-safe idempotency 체크 추가

## Topic Design Notes

### dag-structure
목표:
- DAG, task, schedule의 최소 골격 만들기
- Python script와 DAG definition의 차이 체감

artifact 예시:
- `dags/demo_dag.py`
- `tests/test_dag.py`

### operator
목표:
- TaskFlow task / PythonOperator / provider operator 감각 익히기
- task가 무엇을 하고 operator가 무엇을 감싸는지 분리

artifact 예시:
- `dags/demo_dag.py`
- `plugins/helpers.py`
- `notes.md`

### trigger-rule
목표:
- dependency, branching, skip 전파, trigger rule을 명시적으로 설계
- success/failure/skip 조합을 코드로 이해

artifact 예시:
- `dags/demo_dag.py`
- `tests/test_dag.py`
- `notes.md`

### sensor
목표:
- 외부 이벤트 대기 task를 설계
- polling cost와 timeout 전략을 생각하게 하기

artifact 예시:
- `dags/demo_dag.py`
- `notes.md`

### xcom
목표:
- task 간 작은 데이터 전달 구조 만들기
- XCom, Connection, Hook의 역할을 구분

artifact 예시:
- `dags/demo_dag.py`
- `plugins/helpers.py`
- `data/sample_input.json`

### retry
목표:
- retry, timeout, SLA, alert를 붙여 운영 가능한 흐름 만들기
- failure를 발견 가능하고 재시도 가능한 시스템으로 바꾸기

artifact 예시:
- `dags/demo_dag.py`
- `tests/test_dag.py`
- `notes.md`

### backfill
목표:
- catchup/backfill/re-run 시나리오를 안전하게 다루기
- historical run에서 중복 처리와 idempotency를 생각하게 하기

artifact 예시:
- `dags/demo_dag.py`
- `data/run_notes.jsonl`
- `notes.md`

## Integration

- `airflow-why-cards`와 연결:
  - 같은 topic name으로 why → build 흐름을 만든다
- `rag-guide`와 연결:
  - `backfill` topic은 indexing pipeline 재처리와 연결된다
- `agent-guide`와 연결:
  - `trigger-rule`, `retry` 감각을 agent runtime orchestration에 매핑할 수 있다

## Notes

- Airflow 2.x 기준 (TaskFlow API 포함)
- AI 엔지니어 인터뷰 빈출 토픽 중심
- LLM pipeline 예시를 기본 사례로 사용
- why-card 복습 직후 guide 세션으로 이어질 수 있게 topic naming을 고정한다
- long lecture보다 DAG skeleton + review 질문이 더 중요하다
