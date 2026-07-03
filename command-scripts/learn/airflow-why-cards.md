# Airflow Why Cards — Content Database

---

## dag-structure — DAG 구조 (Directed Acyclic Graph)

### Why Story

매일 밤 3개의 스크립트를 실행해야 한다. extract.py → transform.py → load.py 순서대로. Cron으로 짜면?

```
0 1 * * * python extract.py
0 2 * * * python transform.py   # extract가 1시간 내에 끝난다고 가정
0 3 * * * python load.py
```

extract가 오늘따라 1시간 30분 걸리면? transform이 미완성 데이터로 실행됨. 조용히 틀린 데이터가 적재됨.

DAG = 작업 간 **의존관계**를 명시적으로 선언하고, Airflow가 순서와 타이밍을 보장.

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime

with DAG("etl_pipeline", start_date=datetime(2024, 1, 1), schedule="@daily") as dag:
    extract = PythonOperator(task_id="extract", python_callable=run_extract)
    transform = PythonOperator(task_id="transform", python_callable=run_transform)
    load = PythonOperator(task_id="load", python_callable=run_load)

    extract >> transform >> load  # 의존관계 선언
```

**핵심 개념:**
- **Directed**: 방향 있음 (A → B, B → A 불가)
- **Acyclic**: 순환 없음 (A → B → C → A 불가)
- **Graph**: 복수의 노드(task)와 엣지(의존관계)

🧠 핵심 멘탈 모델: **DAG = 의존관계 있는 작업의 실행 설계도. Cron = 시간 기반, DAG = 완료 기반.**

### 💥 What Breaks Without It?

```bash
# cron 기반 파이프라인
0 2 * * * python transform.py

# transform.py 내부
import pandas as pd
df = pd.read_csv("/tmp/extracted_data.csv")  # extract가 아직 쓰는 중일 수 있음
```

→ race condition. extract 지연 시 transform이 전날 파일 읽음. 데이터 파이프라인 오염. 에러도 안 남.

---

## operator — Operator (작업 단위)

### Why Story

DAG의 각 노드 = Task. Task를 실행하는 것이 Operator.

Airflow에는 다양한 내장 Operator가 있음:

```python
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator

# Python 함수 실행
run_model = PythonOperator(
    task_id="run_model",
    python_callable=train_model,
    op_kwargs={"epochs": 10}
)

# Shell 명령 실행
dbt_run = BashOperator(
    task_id="dbt_run",
    bash_command="dbt run --select my_model"
)

# SQL 실행
create_table = PostgresOperator(
    task_id="create_table",
    postgres_conn_id="my_postgres",
    sql="CREATE TABLE IF NOT EXISTS results (...)"
)
```

**왜 Operator로 분리하는가?**
- 각 Task가 독립적으로 재시도 가능
- Task 단위로 모니터링, 로그, 실행 이력 관리
- 실패한 Task만 재실행 (전체 파이프라인 재실행 불필요)

🧠 핵심 멘탈 모델: **Operator = 재시도·모니터링·의존관계 관리가 가능한 작업 단위.**

### 💥 What Breaks Without It?

```python
# 하나의 거대한 PythonOperator로 모든 작업
def full_pipeline():
    data = extract()      # 5분
    clean = transform(data)  # 10분
    load(clean)           # 3분

run_all = PythonOperator(task_id="run_all", python_callable=full_pipeline)
```

→ transform 단계에서 실패 시 extract부터 재시작. 18분 중 15분 낭비. 어느 단계에서 실패했는지 로그에서 찾기 어려움.

---

## trigger-rule — Trigger Rule (태스크 실행 조건)

### Why Story

기본 동작: upstream task가 **모두 성공해야** downstream 실행. 그런데 실패해도 무조건 실행해야 하는 task가 있다.

```
extract → transform → load
                ↘
              notify_on_failure  # 실패 시 알림 — 성공해도 실패해도 실행해야
```

```python
from airflow.utils.trigger_rule import TriggerRule

notify = PythonOperator(
    task_id="notify",
    python_callable=send_alert,
    trigger_rule=TriggerRule.ONE_FAILED  # upstream 중 하나라도 실패하면 실행
)

cleanup = PythonOperator(
    task_id="cleanup",
    python_callable=clean_temp_files,
    trigger_rule=TriggerRule.ALL_DONE  # 성공/실패 무관하게 항상 실행
)
```

**주요 Trigger Rules:**
| Rule | 실행 조건 |
|------|----------|
| `ALL_SUCCESS` | 모두 성공 (기본값) |
| `ALL_FAILED` | 모두 실패 |
| `ALL_DONE` | 완료 (성공/실패 무관) |
| `ONE_FAILED` | 하나라도 실패 |
| `ONE_SUCCESS` | 하나라도 성공 |
| `NONE_FAILED` | 실패 없음 (skipped OK) |

🧠 핵심 멘탈 모델: **기본값은 ALL_SUCCESS. 알림·정리 태스크는 반드시 trigger_rule 명시 필요.**

### 💥 What Breaks Without It?

```python
# trigger_rule 미설정 (기본값: ALL_SUCCESS)
notify = PythonOperator(task_id="notify_failure", python_callable=send_alert)

transform >> notify  # transform 실패 시?
```

→ transform 실패 → notify가 `upstream_failed` 상태로 **skip**. 알림 전혀 안 감. 파이프라인 실패를 몰라서 다음날 데이터가 없어진 후에야 발견.

---

## sensor — Sensor (외부 조건 대기)

### Why Story

외부 파일이 S3에 올라올 때까지 기다렸다가 처리해야 한다. 어떻게 구현?

직접 polling loop를 PythonOperator로 구현하면 Airflow worker slot을 점유:

```python
# 나쁜 방법
def wait_for_file():
    while not s3.exists("s3://bucket/input.csv"):
        time.sleep(60)  # worker가 60초마다 깨어남, 그 동안 slot 점유
```

Sensor = 조건 충족까지 대기하는 전용 Operator.

```python
from airflow.providers.amazon.aws.sensors.s3 import S3KeySensor

wait_for_file = S3KeySensor(
    task_id="wait_for_input",
    bucket_name="my-bucket",
    bucket_key="input.csv",
    poke_interval=60,     # 60초마다 확인
    timeout=3600,         # 1시간 후 실패 처리
    mode="reschedule",    # 확인 사이에 worker slot 반환 ← 핵심
)
```

**`mode` 옵션:**
- `poke`: worker slot 계속 점유 (기본값, 짧은 대기용)
- `reschedule`: 대기 중 slot 반환, 다음 확인 시 재할당 (긴 대기용)

🧠 핵심 멘탈 모델: **Sensor = 조건부 대기. mode="reschedule"로 worker 자원 효율화.**

### 💥 What Breaks Without It?

```python
# poke mode로 8시간 대기하는 Sensor가 10개
sensors = [S3KeySensor(..., mode="poke") for _ in range(10)]
```

→ worker pool 전체가 Sensor에게 점유됨. 다른 DAG 태스크들이 queue에서 대기. Airflow 전체 처리량 급락. `mode="reschedule"` 이었다면 대기 중엔 slot 반환.

---

## xcom — XCom (태스크 간 데이터 전달)

### Why Story

extract 태스크가 처리한 레코드 수를 load 태스크에게 전달해야 한다. 파일로 공유?

```python
# 나쁜 방법 — 파일 공유
def extract():
    count = process()
    with open("/tmp/count.txt", "w") as f:
        f.write(str(count))  # 다른 Worker에선 이 파일이 없을 수 있음

def load():
    with open("/tmp/count.txt") as f:
        count = int(f.read())
```

XCom = Airflow DB에 소량 데이터를 저장해서 태스크 간 공유.

```python
def extract(**context):
    count = process()
    context["ti"].xcom_push(key="record_count", value=count)  # DB에 저장
    return count  # return 값도 자동으로 xcom_push됨

def load(**context):
    count = context["ti"].xcom_pull(
        task_ids="extract",
        key="record_count"
    )
    print(f"Loaded {count} records")
```

**XCom 주의사항:**
- 소량 데이터만 (기본 64KB 제한 — DB 부담)
- 대용량 데이터는 S3/GCS에 저장 후 경로만 XCom으로 전달

🧠 핵심 멘탈 모델: **XCom = 태스크 간 메시지 박스. 크기 제한 있음 — 경로(path)만 전달하는 게 Best Practice.**

### 💥 What Breaks Without It?

```python
def extract():
    df = fetch_data()
    df.to_csv("/tmp/data.csv")  # 로컬 파일

def transform():
    df = pd.read_csv("/tmp/data.csv")  # 다른 Worker 머신이면 파일 없음
```

→ Celery/Kubernetes executor에서 서로 다른 Worker가 태스크 실행 시 로컬 파일 공유 불가. `FileNotFoundError`. 로컬 executor에서만 우연히 동작.

---

## retry — Retry 정책

### Why Story

외부 API 호출 태스크가 간헐적 503 오류로 실패한다. 재시도하면 성공하는 일시적 오류인데, DAG 전체가 실패 처리된다.

```python
from datetime import timedelta

fetch_api = PythonOperator(
    task_id="fetch_external_api",
    python_callable=call_api,
    retries=3,                          # 최대 3번 재시도
    retry_delay=timedelta(minutes=5),   # 5분 간격
    retry_exponential_backoff=True,     # 지수 백오프 (5분 → 10분 → 20분)
    execution_timeout=timedelta(minutes=30),  # 30분 넘으면 강제 실패
)
```

**Retry 관련 콜백:**
```python
def alert_on_retry(context):
    print(f"Retry #{context['ti'].try_number}: {context['exception']}")

fetch_api = PythonOperator(
    ...
    on_retry_callback=alert_on_retry,
)
```

**언제 retry가 효과적인가:**
- 외부 API 일시적 오류 (503, 429)
- 네트워크 불안정
- 외부 시스템 일시 점검

**효과 없는 경우:**
- 코드 버그 (재시도해도 같은 결과)
- 권한 오류 (재시도해도 같은 결과)

🧠 핵심 멘탈 모델: **Retry = 일시적 외부 오류 흡수. 코드 버그엔 retry가 아니라 fix가 정답.**

### 💥 What Breaks Without It?

```python
# retries 미설정 (기본값: 0)
fetch_api = PythonOperator(task_id="fetch_api", python_callable=call_api)
```

→ 외부 API가 5초간 503 반환 후 복구 → 태스크 실패 → DAG 실패 → downstream 전체 skip. 수동 재실행 필요. `retries=3, retry_delay=timedelta(minutes=2)` 였다면 자동 복구.

---

## backfill — Backfill (과거 데이터 재처리)

### Why Story

새로운 데이터 변환 로직을 배포했다. 과거 3개월치 데이터도 새 로직으로 재처리해야 한다.

```bash
# CLI로 과거 날짜 범위 실행
airflow dags backfill \
    --dag-id my_etl_pipeline \
    --start-date 2024-01-01 \
    --end-date 2024-03-31

# 병렬 실행 (기본값: 순차)
airflow dags backfill \
    --dag-id my_etl_pipeline \
    --start-date 2024-01-01 \
    --end-date 2024-03-31 \
    --max-active-runs 5
```

**Backfill의 전제 조건: 멱등성(Idempotency)**

같은 날짜로 여러 번 실행해도 결과가 동일해야 한다.

```python
# 멱등하지 않음 — backfill 시 중복 데이터
def load_data(**context):
    df = get_data()
    df.to_sql("results", engine, if_exists="append")  # 매번 append

# 멱등함 — 같은 날짜 재실행 시 upsert
def load_data(**context):
    date = context["ds"]  # 실행 날짜 (예: "2024-01-15")
    df = get_data(date)
    # 해당 날짜 데이터 먼저 삭제 후 insert
    engine.execute(f"DELETE FROM results WHERE date = '{date}'")
    df.to_sql("results", engine, if_exists="append")
```

**`{{ ds }}` 템플릿 변수:** Airflow가 각 실행의 날짜를 태스크에 주입. Backfill 시 각 날짜가 자동으로 들어옴.

🧠 핵심 멘탈 모델: **Backfill = 과거 날짜 재실행. 멱등성 없으면 중복 데이터. `{{ ds }}`로 날짜 범위 처리.**

### 💥 What Breaks Without It?

```python
# if_exists="append" — 멱등하지 않은 로드
def load(**context):
    df = transform()
    df.to_sql("sales", engine, if_exists="append")
```

→ backfill 실행 시 같은 날짜 데이터가 2배로 적재. 매출 집계가 2배로 뻥튀기. 데이터 정합성 파괴. 운영 중 발견 어려움.
