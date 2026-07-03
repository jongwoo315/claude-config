# FastAPI Why Cards — Content

---

## fastapi-schema — Pydantic Schema

### Why Story

API 입출력 타입을 Python 클래스로 선언 → **자동 유효성 검사 + 직렬화 + OpenAPI 문서** 생성.

```python
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    age: int

@app.post("/users/")
async def create_user(user: UserCreate):
    # user.email은 이미 유효한 이메일
    # user.age는 이미 int (문자열 "25" 자동 변환)
    ...
```

🧠 핵심: 요청 body가 스키마와 맞지 않으면 FastAPI가 422 자동 반환. 뷰에서 검사 코드 필요 없음.

### 💥 What Breaks Without It?

```python
@app.post("/users/")
async def create_user(request: Request):
    data = await request.json()
    if 'email' not in data:
        raise HTTPException(400, "email required")
    if not re.match(r'^[^@]+@[^@]+$', data['email']):
        raise HTTPException(400, "invalid email")
    age = data.get('age')
    if not isinstance(age, int):
        raise HTTPException(400, "age must be int")
    ...
```

→ 필드 추가마다 검사 코드 추가. OpenAPI 문서에 타입 정보 없음. 응답 직렬화도 수동.

---

## fastapi-router — Path Operations & Router

### Why Story

FastAPI에서 엔드포인트는 **path operation decorator**로 선언:

```python
@app.get("/users/{user_id}")
async def get_user(user_id: int):
    ...
```

앱이 커지면 모든 라우트를 `main.py` 하나에 넣을 수 없음.
`APIRouter`로 도메인별 분리:

```python
# routers/users.py
router = APIRouter(prefix="/users", tags=["users"])

@router.get("/{user_id}")
async def get_user(user_id: int): ...

# main.py
app.include_router(users.router)
```

🧠 핵심: `include_router`로 prefix/tags를 한 번만 선언. 뷰 함수는 도메인 로직만 집중.

### 💥 What Breaks Without It?

```python
# main.py에 전부 몰아넣기
@app.get("/users/{user_id}")
async def get_user(user_id: int): ...

@app.post("/users/")
async def create_user(user: UserCreate): ...

@app.get("/orders/{order_id}")
async def get_order(order_id: int): ...
# 100개 엔드포인트가 main.py 한 파일에...
```

→ 파일 비대화, 팀 작업 시 충돌, prefix 변경 시 전체 수정.

---

## fastapi-di — Dependency Injection

### Why Story

여러 엔드포인트에서 공통으로 필요한 것들 — DB 세션, 현재 유저, 설정값 등.
직접 호출하면 중복 + 결합도 증가.

FastAPI의 `Depends`로 선언적 주입:

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/users/")
async def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()
```

🧠 핵심: 의존성은 함수. 중첩 가능 (`get_current_user`가 `get_db`에 의존하는 식). 테스트 시 `app.dependency_overrides`로 교체 가능.

### 💥 What Breaks Without It?

```python
@app.get("/users/")
async def list_users():
    db = SessionLocal()  # 매번 직접 생성
    try:
        users = db.query(User).all()
        return users
    finally:
        db.close()  # 에러 시 close 누락 위험
```

→ DB 연결 관리 로직 반복. 테스트 시 실제 DB 대체 불가. 에러 경로에서 세션 누수 위험.

---

## fastapi-middleware — 미들웨어

### Why Story

모든 요청/응답에 공통 처리 — 로깅, 타이밍, CORS, 인증 헤더 등.

```python
from starlette.middleware.base import BaseHTTPMiddleware

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start
        response.headers["X-Process-Time"] = str(duration)
        return response

app.add_middleware(TimingMiddleware)
```

🧠 핵심: 미들웨어 스택은 양방향 파이프라인. `call_next` 전 = 요청 처리, 후 = 응답 처리. 순서 중요 (나중 추가가 바깥쪽).

### 💥 What Breaks Without It?

```python
@app.get("/users/")
async def list_users():
    start = time.time()
    result = ...
    logger.info(f"took {time.time()-start}s")
    return result

@app.get("/orders/")
async def list_orders():
    start = time.time()
    result = ...
    logger.info(f"took {time.time()-start}s")  # 중복!
    return result
```

→ 모든 엔드포인트에 중복 코드. 미들웨어로 한 번만 선언하면 전체 적용.

---

## fastapi-auth — OAuth2 / JWT 인증

### Why Story

FastAPI는 OAuth2 Password Flow를 내장 지원:

```python
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user = await get_user(payload["sub"])
    if not user:
        raise HTTPException(401, "Invalid credentials")
    return user

@app.get("/me/")
async def read_me(current_user: User = Depends(get_current_user)):
    return current_user
```

🧠 핵심: `OAuth2PasswordBearer`가 `Authorization: Bearer <token>` 헤더 자동 파싱. `Depends(get_current_user)`로 보호된 엔드포인트 선언 1줄.

### 💥 What Breaks Without It?

```python
@app.get("/me/")
async def read_me(request: Request):
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(401)
    token = auth.split(" ")[1]
    # JWT 파싱 + 유저 조회 로직 중복...
```

→ 모든 보호 엔드포인트마다 토큰 파싱 반복. OpenAPI UI에 자물쇠 아이콘 없음. 테스트 시 헤더 직접 조작.

---

## fastapi-async — Async/Await

### Why Story

FastAPI는 ASGI 기반 — `async def`로 I/O 작업(DB, HTTP 호출)을 논블로킹으로 처리.

```python
# 동기 — 스레드 점유, 동시 요청 시 블로킹
def get_user(user_id: int, db: Session = Depends(get_db)):
    return db.query(User).filter(User.id == user_id).first()

# 비동기 — I/O 대기 중 다른 요청 처리 가능
async def get_user(user_id: int, db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
```

🧠 핵심: `async def` + `await` = 이벤트 루프가 I/O 대기 시간에 다른 코드 실행. CPU 바운드 작업엔 적합하지 않음 (`run_in_threadpool` 사용).

### 💥 What Breaks Without It?

```python
async def get_weather():
    # await 없이 동기 requests 사용
    import requests
    response = requests.get("https://api.weather.com/...")  # 블로킹!
    return response.json()
```

→ `async def` 안에서 동기 블로킹 호출 → 이벤트 루프 블로킹 → 전체 서버 응답 지연. `httpx.AsyncClient` + `await` 사용해야.

---

## fastapi-background — Background Tasks

### Why Story

요청 응답을 즉시 보내되, 느린 작업(이메일 발송, 알림, 로그 저장)은 백그라운드에서 실행:

```python
from fastapi import BackgroundTasks

def send_notification(email: str, message: str):
    # 느린 작업
    email_client.send(email, message)

@app.post("/users/")
async def create_user(user: UserCreate, background_tasks: BackgroundTasks):
    db_user = create_user_in_db(user)
    background_tasks.add_task(send_notification, user.email, "Welcome!")
    return db_user  # 이메일 전송 기다리지 않고 즉시 반환
```

🧠 핵심: `BackgroundTasks`는 FastAPI 내장. 응답 전송 후 실행 보장. Celery 없이 간단한 비동기 작업 처리 가능. 단, 서버 재시작 시 소실 (무거운 작업엔 Celery/ARQ 사용).

### 💥 What Breaks Without It?

```python
@app.post("/users/")
async def create_user(user: UserCreate):
    db_user = create_user_in_db(user)
    send_notification(user.email, "Welcome!")  # 블로킹 — 이메일 전송 완료까지 응답 대기
    return db_user
```

→ 이메일 서버 느리면 API 응답도 느려짐. 이메일 실패 시 유저 생성도 실패로 보임. UX 저하.

---

## fastapi-lifespan — Lifespan Events

### Why Story

앱 시작 시 DB 커넥션 풀, ML 모델, 캐시 초기화 — 종료 시 정리.
예전엔 `@app.on_event("startup")`, 지금은 `lifespan` 컨텍스트 매니저:

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await db_pool.connect()
    ml_model = load_model("model.pkl")
    app.state.model = ml_model
    yield
    # shutdown
    await db_pool.disconnect()

app = FastAPI(lifespan=lifespan)
```

🧠 핵심: `yield` 전 = startup, 후 = shutdown. `app.state`로 리소스 공유. 테스트에서 `lifespan` 직접 제어 가능.

### 💥 What Breaks Without It?

```python
# 글로벌 변수로 모델 로딩
model = load_model("model.pkl")  # 임포트 시점에 실행

@app.post("/predict/")
async def predict(data: InputData):
    return model.predict(data)
```

→ 모듈 임포트 시 무거운 초기화 실행. 테스트 임포트도 모델 로딩. 에러 시 앱 시작 실패. 정리 코드 실행 보장 불가.
