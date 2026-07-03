# React Why Cards — Content

---

## react-components — 컴포넌트 개념

### Why Story

React의 핵심은 UI를 **독립적이고 재사용 가능한 조각(컴포넌트)** 으로 나누는 것.

HTML을 그냥 쓰면 중복이 생김:
```html
<!-- 10곳에 같은 버튼 스타일 반복 -->
<button class="btn btn-primary">저장</button>
<button class="btn btn-primary">제출</button>
```

React 컴포넌트:
```jsx
function Button({ label, onClick }) {
    return <button className="btn btn-primary" onClick={onClick}>{label}</button>;
}
// 사용
<Button label="저장" onClick={handleSave} />
<Button label="제출" onClick={handleSubmit} />
```

🧠 핵심: 컴포넌트 = 함수. 입력(props) 받아 JSX 반환. 로직+UI 캡슐화.

### 💥 What Breaks Without It?

버튼 스타일 바꾸려면 10곳 전부 수정. 하나 빠뜨리면 UI 불일치. 컴포넌트로 분리하면 한 곳만 수정.

---

## react-state — useState (상태 관리)

### Why Story

일반 JS 변수를 바꾸면 화면이 안 바뀜. React는 **상태(state)가 바뀔 때만 리렌더링**함.

```jsx
// 안 됨 — 변수 바꿔도 화면 그대로
let count = 0;
function Counter() {
    return <button onClick={() => count++}>{count}</button>;
}

// 됨 — useState로 상태 관리
function Counter() {
    const [count, setCount] = useState(0);
    return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

🧠 핵심: `setState` 호출 → React가 리렌더링 스케줄링. 직접 변수 수정은 React가 모름.

### 💥 What Breaks Without It?

```jsx
function Toggle() {
    let isOn = false;
    return (
        <button onClick={() => { isOn = !isOn; }}>
            {isOn ? 'ON' : 'OFF'}
        </button>
    );
}
```

→ 버튼 눌러도 텍스트 안 바뀜. `isOn`은 바뀌지만 React는 리렌더링 안 함.

---

## react-effects — useEffect (사이드 이펙트)

### Why Story

API 호출, 구독, 타이머 — **렌더링 외부의 작업(사이드 이펙트)** 은 렌더링 도중 하면 안 됨.
`useEffect`는 렌더링 후에 실행:

```jsx
function UserProfile({ userId }) {
    const [user, setUser] = useState(null);

    useEffect(() => {
        fetch(`/api/users/${userId}`)
            .then(res => res.json())
            .then(data => setUser(data));

        return () => { /* cleanup */ };
    }, [userId]);  // userId 바뀔 때만 재실행

    return <div>{user?.name}</div>;
}
```

🧠 핵심: 의존성 배열(`[]`)이 "언제 실행할지" 결정. 빈 배열 = 마운트 시 1번만. 없으면 매 렌더마다.

### 💥 What Breaks Without It?

```jsx
function Component({ id }) {
    // 렌더링 중 fetch — 매 렌더마다 API 호출 폭발
    fetch(`/api/data/${id}`).then(...);
    return <div>...</div>;
}
```

→ 무한 API 호출 루프 가능성. 상태 업데이트 → 리렌더 → fetch → 상태 업데이트 → ...

---

## react-rendering — Virtual DOM / 리렌더링

### Why Story

실제 DOM 조작은 비쌈. React는 **Virtual DOM**(메모리 내 가상 DOM)을 유지하다가, 변경된 부분만 실제 DOM에 반영(Reconciliation):

```
상태 변경 → 새 Virtual DOM 생성 → 이전 VDOM과 diff → 변경된 노드만 실제 DOM 업데이트
```

컴포넌트 리렌더링 조건:
1. `setState` 호출
2. 부모 컴포넌트 리렌더 (props 변경 여부 무관)
3. Context 값 변경

🧠 핵심: 리렌더 = Virtual DOM 재계산. 실제 DOM 변경은 diff 결과가 있을 때만.

### 💥 What Breaks Without It?

```jsx
function Parent() {
    const [count, setCount] = useState(0);
    return (
        <>
            <button onClick={() => setCount(c => c + 1)}>+</button>
            <HeavyChild />  {/* count와 무관한데 매번 리렌더 */}
        </>
    );
}
```

→ `HeavyChild`가 비싼 컴포넌트면 불필요한 리렌더로 성능 저하. `React.memo`로 메모이제이션 필요.

---

## react-props — Props / 단방향 데이터 흐름

### Why Story

React 데이터는 **부모 → 자식** 방향으로만 흐름(단방향).
자식은 props를 직접 수정 못 함 — 부모에게 콜백으로 요청해야 함:

```jsx
function Parent() {
    const [name, setName] = useState('');
    return <Input value={name} onChange={setName} />;
}

function Input({ value, onChange }) {
    return <input value={value} onChange={e => onChange(e.target.value)} />;
}
```

🧠 핵심: props는 읽기 전용. 상태는 항상 "진실의 원천(single source of truth)" 하나에만 존재.

### 💥 What Breaks Without It?

```jsx
function Child({ user }) {
    user.name = 'hacked';  // props 직접 수정 시도
}
```

→ 부모 상태 예측 불가. React는 이 변경을 감지 못해 UI 불일치. 디버깅 지옥.

---

## react-context — Context API

### Why Story

Props를 여러 단계를 거쳐 전달해야 할 때(Prop Drilling):

```jsx
// 3단계 전달 — 중간 컴포넌트는 user가 필요 없는데 전달만 함
<App user={user}>
  <Layout user={user}>
    <Sidebar user={user}>
      <UserMenu user={user} />
```

Context로 전역 상태처럼 제공:
```jsx
const UserContext = createContext(null);

// Provider로 감싸기
<UserContext.Provider value={user}>
    <App />
</UserContext.Provider>

// 어디서든 바로 접근
function UserMenu() {
    const user = useContext(UserContext);
}
```

🧠 핵심: Context = 컴포넌트 트리 전체에 값을 주입하는 파이프. 테마, 인증, 언어 설정에 적합.

### 💥 What Breaks Without It?

10단계 깊이의 컴포넌트에 props 전달 → 중간 컴포넌트 모두 수정 → 유지보수 지옥. Context 또는 상태관리 라이브러리(Zustand, Redux)로 해결.

---

## react-memo — useMemo / useCallback

### Why Story

리렌더 시 함수와 객체는 **매번 새로 생성** → 자식 컴포넌트에 prop으로 전달 시 매번 다른 참조 = 불필요한 리렌더.

```jsx
// 매 렌더마다 새 함수 생성 → Child 리렌더
function Parent() {
    const handleClick = () => console.log('click');
    return <Child onClick={handleClick} />;
}

// useCallback — 의존성 안 바뀌면 같은 참조 유지
function Parent() {
    const handleClick = useCallback(() => console.log('click'), []);
    return <Child onClick={handleClick} />;
}
```

`useMemo` — 비싼 계산 결과 캐싱:
```jsx
const sorted = useMemo(() => items.sort(compareFn), [items]);
```

🧠 핵심: `useCallback` = 함수 메모이제이션. `useMemo` = 값 메모이제이션. `React.memo`와 함께 써야 효과 있음.

### 💥 What Breaks Without It?

```jsx
const Child = React.memo(({ onClick }) => <button onClick={onClick}>click</button>);

function Parent() {
    const handleClick = () => {};  // 매 렌더마다 새 함수
    return <Child onClick={handleClick} />;  // React.memo 무용지물
}
```

→ `React.memo`로 감쌌어도 onClick 참조가 매번 달라 Child 리렌더 막지 못함.

---

## react-hooks — Custom Hooks

### Why Story

컴포넌트에서 반복되는 로직(API 호출, 폼 상태, 윈도우 크기 등)을 **재사용 가능한 함수로 추출**:

```jsx
// 반복되는 fetch 로직
function useFetch(url) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(url).then(r => r.json()).then(d => {
            setData(d);
            setLoading(false);
        });
    }, [url]);

    return { data, loading };
}

// 어디서든 재사용
function UserProfile({ id }) {
    const { data: user, loading } = useFetch(`/api/users/${id}`);
    if (loading) return <Spinner />;
    return <div>{user.name}</div>;
}
```

🧠 핵심: Custom Hook = `use`로 시작하는 일반 함수. 훅 내부에서 다른 훅 사용 가능. 로직만 추출, JSX 반환 안 함.

### 💥 What Breaks Without It?

fetch 로직을 3개 컴포넌트에 복붙 → 에러 처리 방식 달라짐 → 한 곳 수정 시 나머지 2곳도 수동 수정. Custom Hook으로 한 곳에서 관리.
