# Agent Patterns Why Cards — Content Database

---

## react-loop — ReAct 루프 (Reasoning + Acting)

### Why Story

LLM에게 "오늘 서울 날씨 알려줘"라고 하면? 훈련 데이터에 없는 실시간 정보 → hallucination.

ReAct = **Re**asoning + **Act**ing. 생각(Thought) → 행동(Action) → 관찰(Observation) 루프.

```python
from langchain.agents import AgentExecutor, create_react_agent
from langchain_community.tools import DuckDuckGoSearchRun

tools = [DuckDuckGoSearchRun()]
agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = agent_executor.invoke({"input": "오늘 서울 날씨는?"})

# 내부 동작:
# Thought: 실시간 날씨 정보가 필요하다. 검색해야겠다.
# Action: duckduckgo_search("서울 날씨 오늘")
# Observation: "서울 현재 기온 23도, 맑음..."
# Thought: 검색 결과로 답변 가능하다.
# Final Answer: "오늘 서울은 23도, 맑은 날씨입니다."
```

**왜 루프가 필요한가?** 단발 추론은 현재 컨텍스트만 사용. 루프는 관찰 결과를 다음 추론에 반영. 동적 정보 + 멀티스텝 작업 가능.

🧠 핵심 멘탈 모델: **ReAct = LLM에게 (생각 → 도구사용 → 결과확인) 반복 허용**

### 💥 What Breaks Without It?

```python
# 단순 LLM 호출
response = llm.invoke("오늘 애플 주가 기반으로 투자 조언 해줘")
# → "애플 주가는 약 $180 수준이며..." (훈련 데이터 기준 오래된 정보)
# → 실제 주가와 다르면 잘못된 투자 판단
```

→ 루프 없이는 LLM이 기억 속 정보만 사용. 실시간·동적 태스크 불가.

---

## tool-use — Tool Use / Function Calling

### Why Story

LLM은 텍스트만 생성한다. 계산, DB 조회, API 호출, 파일 읽기 — 전부 못한다. 그래서 "도구"를 준다.

Tool use = LLM이 함수 호출을 명세하면, 코드가 실행하고 결과를 LLM에게 돌려줌.

```python
from openai import OpenAI
import json

client = OpenAI()

# 도구 정의
tools = [{
    "type": "function",
    "function": {
        "name": "get_current_weather",
        "description": "현재 날씨 정보 조회",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "도시명"},
            },
            "required": ["city"]
        }
    }
}]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "부산 날씨 알려줘"}],
    tools=tools,
)

# LLM이 tool call 결정
tool_call = response.choices[0].message.tool_calls[0]
# → function: get_current_weather, args: {"city": "부산"}
```

**LLM 역할:** 어떤 도구를, 어떤 인자로 호출할지 결정 (실행은 코드가 함).
**코드 역할:** 실제 함수 실행 후 결과를 LLM에게 다시 전달.

🧠 핵심 멘탈 모델: **LLM = 두뇌 (무엇을 할지). 도구 = 팔다리 (실제 실행).**

### 💥 What Breaks Without It?

```python
# 도구 없이 수학 계산
response = llm.invoke("12847 × 9834 = ?")
# → "약 126,382,098" (틀림. 실제: 126,365,298)
```

→ LLM은 수학 계산기가 아님. Calculator 도구 없이는 큰 수 연산 오류율 높음. DB 조회, 실시간 데이터 모두 마찬가지.

---

## planning — Planning (계획 수립)

### Why Story

"내 사업 아이디어 검증해줘" → 단일 LLM 호출로 처리 가능? 아니다. 여러 단계 필요:
1. 아이디어 분석
2. 시장 조사
3. 경쟁사 검색
4. SWOT 분석
5. 최종 리포트

Planning = 복잡한 목표를 서브태스크로 분해하고 순서·의존관계 결정.

```python
from langchain.agents import AgentType, initialize_agent
from langchain_experimental.plan_and_execute import PlanAndExecute, load_agent_executor, load_chat_planner

# Plan-and-Execute 패턴
planner = load_chat_planner(llm)
executor = load_agent_executor(llm, tools, verbose=True)
agent = PlanAndExecute(planner=planner, executor=executor, verbose=True)

result = agent.invoke({"input": "Python으로 간단한 웹 스크래퍼 만들고 테스트까지 해줘"})

# Planner 출력:
# Step 1: requests, BeautifulSoup 라이브러리 필요 확인
# Step 2: 스크래퍼 코드 작성
# Step 3: 테스트 코드 작성
# Step 4: 실행 결과 확인
```

**ReAct vs Planning:**
- ReAct: 즉흥적. 다음 행동을 그때그때 결정
- Planning: 선계획 후실행. 전체 그림 먼저, 단계별 실행

🧠 핵심 멘탈 모델: **Planning = 에이전트에게 프로젝트 매니저 역할 부여**

### 💥 What Breaks Without It?

```python
# 계획 없이 복잡한 작업 시도
agent.invoke("경쟁사 분석해서 투자 보고서 써줘")
# → 검색 → 또 검색 → 또 검색 → 방향 없이 표류
# → 같은 정보 반복 수집, 핵심 분석 누락, 맥락 폭발
```

→ 계획 없이는 멀티스텝 태스크에서 에이전트가 방향 잃음. 무한루프 또는 핵심 단계 건너뜀.

---

## agent-memory — Agent Memory

### Why Story

사용자가 10턴 대화 후 "아까 말한 프로젝트 이름이 뭐였지?" → LLM이 모른다. 컨텍스트가 날아갔다.

에이전트 메모리 = 대화 이력과 중요 정보를 저장·활용.

**두 종류:**

```python
from langchain.memory import ConversationBufferWindowMemory, ConversationSummaryMemory
from langchain_community.vectorstores import FAISS

# 1. 단기 메모리 — 최근 N턴만 유지
short_term = ConversationBufferWindowMemory(k=5)  # 최근 5턴

# 2. 요약 메모리 — 긴 대화를 요약해서 보관
summary_mem = ConversationSummaryMemory(llm=llm)

# 3. 장기 메모리 — 벡터 DB에 저장, 의미 검색
vectorstore = FAISS.from_texts(["사용자 선호: 파이썬, 빠른 응답 선호"], embedding)

class AgentWithMemory:
    def __init__(self):
        self.short_term = []   # 현재 대화
        self.long_term = vectorstore  # 중요 사실들

    def remember(self, fact: str):
        self.long_term.add_texts([fact])
```

**메모리 유형 선택:**
| 유형 | 장점 | 단점 | 사용처 |
|------|------|------|--------|
| Buffer | 완전한 이력 | 컨텍스트 폭발 | 짧은 대화 |
| Window | 컨텍스트 제한 | 오래된 정보 손실 | 일반 챗봇 |
| Summary | 압축 유지 | 요약 오류 가능 | 긴 대화 |
| Vector | 의미 검색 | 검색 누락 가능 | 개인화 봇 |

🧠 핵심 멘탈 모델: **단기 = RAM, 장기 = HDD. 컨텍스트 한계 = RAM 용량.**

### 💥 What Breaks Without It?

```python
# 메모리 없는 에이전트
session = []
session.append({"role": "user", "content": "내 이름은 철수야"})
# ... 20턴 후 ...
response = llm.invoke(session + [{"role": "user", "content": "내 이름 기억해?"}])
# → 컨텍스트 초과 또는 "이름을 알 수 없습니다"
```

→ 개인화 불가, 반복 질문 발생, 컨텍스트 초과 오류. 실제 어시스턴트로 사용 불가.

---

## langgraph — LangGraph State Machines

### Why Story

단순 체인: A → B → C. 그런데 실제 에이전트는 더 복잡하다.
- 조건 분기 (if 검색 결과 없으면 다른 전략)
- 루프 (검토 → 수정 → 검토 반복)
- 병렬 실행 (여러 에이전트 동시)

LangGraph = 에이전트 흐름을 **상태 기계 그래프**로 정의.

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict

class AgentState(TypedDict):
    question: str
    search_results: list
    answer: str
    needs_more_search: bool

def search_node(state: AgentState) -> AgentState:
    results = search_tool(state["question"])
    return {"search_results": results}

def evaluate_node(state: AgentState) -> AgentState:
    if len(state["search_results"]) < 2:
        return {"needs_more_search": True}
    return {"needs_more_search": False, "answer": generate_answer(state)}

def route(state: AgentState) -> str:
    return "search" if state["needs_more_search"] else END

graph = StateGraph(AgentState)
graph.add_node("search", search_node)
graph.add_node("evaluate", evaluate_node)
graph.add_edge("search", "evaluate")
graph.add_conditional_edges("evaluate", route)  # 조건 분기
```

**LangChain 체인 vs LangGraph:**
- LangChain 체인: 선형. 한 방향만.
- LangGraph: 그래프. 루프, 분기, 병렬 가능.

🧠 핵심 멘탈 모델: **LangGraph = 에이전트용 상태 기계. 복잡한 흐름을 명시적으로 제어.**

### 💥 What Breaks Without It?

```python
# 선형 체인으로 self-refinement 구현 시도
chain = search | evaluate | refine | evaluate | refine  # 반복 횟수 하드코딩
# → "몇 번 반복할지?" 모름. 품질 기준 충족 시 조기 종료 불가.
# → 조건부 루프 = 불가능
```

→ 선형 체인으로는 동적 루프·분기 불가. 복잡한 에이전트 흐름을 코드로 직접 구현해야 함 → 유지보수 지옥.

---

## multi-agent — Multi-Agent Orchestration

### Why Story

"코드 작성 + 코드 리뷰 + 테스트 작성 + 보안 감사"를 한 에이전트가 다 하면?
- 컨텍스트 폭발
- 역할 혼란 ("지금 개발자야? 리뷰어야?")
- 긴 작업에서 앞부분 내용 망각

Multi-agent = 전문화된 에이전트들이 역할 분담.

```python
from langgraph.graph import StateGraph

# 각 에이전트가 전문 역할
researcher = create_agent(llm, tools=[search_tool], 
                          system="당신은 정보 수집 전문가입니다.")
writer = create_agent(llm, tools=[],
                      system="당신은 기술 문서 작성 전문가입니다.")
reviewer = create_agent(llm, tools=[],
                        system="당신은 코드 리뷰어입니다. 보안/성능/가독성 관점에서만 평가합니다.")

# 오케스트레이터가 흐름 제어
def orchestrate(task: str):
    research = researcher.invoke({"task": task})
    draft = writer.invoke({"research": research})
    review = reviewer.invoke({"code": draft})
    return review
```

**언제 Multi-agent가 필요한가:**
- 작업이 명확히 구분되는 전문 영역 포함
- 단일 에이전트 컨텍스트 한계 초과
- 체크 앤 밸런스 필요 (생성 에이전트 vs 검증 에이전트)

🧠 핵심 멘탈 모델: **Multi-agent = 스타트업 팀 구성. 만능 직원 1명보다 전문가 팀이 낫다.**

### 💥 What Breaks Without It?

```python
# 모든 역할을 단일 에이전트
agent.invoke("리서치하고, 코드 쓰고, 테스트하고, 문서화해줘")
# 30턴 후:
# - 처음 리서치 내용 망각
# - "코드 작성 중" 중간에 갑자기 다시 리서치 시작
# - 역할 전환 시 이전 컨텍스트 오염
```

→ 컨텍스트 한계 초과. 역할 혼란. 긴 작업에서 품질 급락.

---

## agent-failures — Agent Failure Patterns

### Why Story

에이전트를 배포했다. 그런데 프로덕션에서 이상하게 동작한다.

실제 에이전트 실패 패턴 TOP 3:

**1. Hallucinated Tool Calls**
```python
# LLM이 존재하지 않는 함수 호출 시도
# Thought: send_email 도구를 써야겠다.
# Action: send_email(to="boss@company.com", subject="...")
# → ToolNotFoundError (send_email 미정의)
```

**2. Infinite Loop**
```python
# 탈출 조건 없는 검색 루프
while True:
    results = search(query)
    if not satisfactory(results):  # 만족스러운 결과 기준이 모호
        query = refine(query)
        # → 영원히 반복
```

**3. Context Overflow**
```python
# 긴 작업에서 컨텍스트 한계 초과
agent_executor = AgentExecutor(agent=agent, max_iterations=50)
# 50턴 작업 → 토큰 한계 초과 → 중간에 강제 종료
```

**방어 전략:**
- `max_iterations` + `max_execution_time` 설정
- 도구 명세 명확히 (LLM이 없는 도구 호출 방지)
- fallback 로직 구현
- 중간 상태 저장 (컨텍스트 압축 또는 요약)

🧠 핵심 멘탈 모델: **에이전트 = 자율 시스템. 안전장치 없으면 무한 실행·환각 도구 호출.**

### 💥 What Breaks Without It?

```python
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    # max_iterations 미설정
)
result = agent_executor.invoke({"input": "최적의 투자 포트폴리오 찾아줘"})
# → 수십 번 검색 반복 → API 비용 폭발
# → 최악: LLM이 존재하지 않는 'execute_trade' 도구 호출 시도
```

→ 안전장치 없는 에이전트 = 비용 폭발 또는 의도치 않은 사이드 이펙트.

---

## reflexion — Reflexion / Self-Critique

### Why Story

에이전트가 틀린 코드를 생성했다. 실행하면 오류가 난다. 그냥 오류 메시지 반환?

Reflexion = 에이전트가 자기 결과를 비평하고 개선. 실패 → 원인 분석 → 재시도.

```python
def reflexion_agent(task: str, max_retries: int = 3) -> str:
    attempt = llm.invoke(task)

    for i in range(max_retries):
        # 실행 시도
        try:
            result = execute(attempt)
            return result
        except Exception as e:
            error = str(e)

        # 자기 비평 + 개선
        critique_prompt = f"""
이전 시도:
{attempt}

오류:
{error}

무엇이 잘못됐는지 분석하고 수정된 버전을 작성해줘.
"""
        attempt = llm.invoke(critique_prompt)

    return attempt  # 최선의 시도 반환

# 실제 LangGraph로 구현하면:
# generate → execute → evaluate (성공?) → [END or critique → generate]
```

**Reflexion이 효과적인 이유:**
- 오류 메시지가 다음 시도의 few-shot 예시가 됨
- LLM이 자기 실수 패턴 인식
- 외부 피드백 없이 자가 개선

🧠 핵심 멘탈 모델: **Reflexion = 에이전트에게 자기 코드 리뷰 능력 부여**

### 💥 What Breaks Without It?

```python
# Reflexion 없는 코드 생성 에이전트
code = agent.generate_code("파일에서 JSON 파싱해줘")
# → `json.load(file_path)` (틀림: 파일 경로가 아닌 파일 객체 필요)
# → 실행 시 TypeError
# → 에이전트가 오류 인식 못하고 그냥 반환
```

→ 초기 실수가 최종 결과. Reflexion 없으면 에이전트가 자기 오류를 배울 수 없음. Human-in-the-loop 없이는 품질 보장 불가.
