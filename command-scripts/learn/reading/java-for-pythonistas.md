# Java for Pythonistas
> Python 개발자를 위한 Java 핵심 개념 정리
> 진도에 맞게 업데이트됩니다. 지하철 복습용.

---

## 목차

1. [Java vs Python — 큰 그림](#1-java-vs-python--큰-그림)
2. [Types — 타입 시스템](#2-types--타입-시스템)
3. [Collections — 자료구조](#3-collections--자료구조)
4. [Strings — 문자열](#4-strings--문자열)
5. [Stream API — 파이프라인](#5-stream-api--파이프라인)
6. [Generics — 제네릭](#6-generics--제네릭)
7. [Null 처리](#7-null-처리)
8. [OOP — 클래스와 인터페이스](#8-oop--클래스와-인터페이스)
9. [Exceptions — 예외 처리](#9-exceptions--예외-처리)
10. [자주 쓰는 패턴 치트시트](#10-자주-쓰는-패턴-치트시트)

---

## 1. Java vs Python — 큰 그림

### 철학의 차이

| | Python | Java |
|-|--------|------|
| 타입 | 동적 (런타임 결정) | 정적 (컴파일 타임 결정) |
| 에러 발견 시점 | 런타임 | 컴파일 타임 |
| 실행 방식 | 인터프리터 | JVM 바이트코드 |
| 클래스 필수? | 아니오 | 예 (모든 코드는 클래스 안) |
| null/None | None | null (NPE 주의) |
| 세미콜론 | 없음 | 필수 `;` |

### 컴파일 흐름

```
Python:  소스(.py) → 인터프리터 → 실행
Java:    소스(.java) → 컴파일(javac) → 바이트코드(.class) → JVM → 실행
```

### 가장 많이 당황하는 것들

```java
// 1. 세미콜론 빠뜨리기
int x = 10   // ❌ 컴파일 에러
int x = 10;  // ✅

// 2. 타입 선언 안 하기
x = 10;          // ❌ (var 없이는 불가)
int x = 10;      // ✅
var x = 10;      // ✅ (Java 10+)

// 3. print 문법
print("hello")           // ❌ Python 문법
System.out.println("hello");  // ✅

// 4. == 로 문자열 비교
str1 == str2         // ❌ 주소 비교
str1.equals(str2)    // ✅ 내용 비교
```

---

## 2. Types — 타입 시스템

### 원시 타입 vs 객체 타입

Python에서는 모든 것이 객체. Java는 원시(primitive) 타입과 객체 타입이 분리됨.

| 원시 타입 | 객체 타입 (박싱) | Python 대응 |
|----------|----------------|------------|
| `int` | `Integer` | `int` |
| `long` | `Long` | `int` (무한 정밀도) |
| `double` | `Double` | `float` |
| `boolean` | `Boolean` | `bool` |
| `char` | `Character` | `str` (길이 1) |

```python
# Python — 모두 객체
x = 42
y = 3.14
z = True
```

```java
// Java — 원시 타입 (스택, 빠름)
int x = 42;
double y = 3.14;
boolean z = true;

// Java — 객체 타입 (힙, 느리지만 null 가능, 컬렉션에 필요)
Integer x = 42;       // 박싱(boxing)
Double y = 3.14;
Boolean z = true;
```

### 왜 둘 다 있나?

- **원시 타입**: 빠르다, null 불가
- **객체 타입**: `List<Integer>` 같은 제네릭에 필요, null 가능, 메서드 존재

```java
List<int> list = new ArrayList<>();     // ❌ 원시 타입은 제네릭 불가
List<Integer> list = new ArrayList<>(); // ✅ 객체 타입 필요
```

### 오토박싱 (Auto-boxing)

Java가 원시↔객체 변환을 자동으로 해줌:

```java
Integer a = 42;      // int → Integer 자동 박싱
int b = a;           // Integer → int 자동 언박싱

// 주의: null 언박싱은 NPE
Integer c = null;
int d = c;           // 💥 NullPointerException
```

### var 키워드 (Java 10+)

Python처럼 타입 추론. 하지만 컴파일 타임에 타입이 확정됨.

```python
# Python — 런타임에 타입 결정, 재할당 가능
x = 42
x = "hello"  # OK
```

```java
// Java var — 컴파일 타임에 타입 확정, 재할당 불가
var x = 42;       // int로 확정
x = "hello";      // ❌ 컴파일 에러 (int에 String 불가)

// 로컬 변수에만 사용 가능 (파라미터, 필드 불가)
var list = new ArrayList<String>();  // 타입 추론 편리
```

### 타입 캐스팅

```python
# Python
x = int(3.7)   # 3
y = float(5)   # 5.0
z = str(42)    # "42"
```

```java
// Java — (타입) 앞에 붙임
int x = (int) 3.7;       // 3 (소수점 버림, 반올림 아님!)
double y = (double) 5;   // 5.0
String z = String.valueOf(42);  // "42" (String.valueOf 사용)
// 또는
String z = Integer.toString(42);

// 주의: int / int = int (소수점 버림)
int a = 5 / 2;           // 2 (소수점 버림!)
double b = (double) 5 / 2;  // 2.5 ✅
double c = 5 / 2;           // 2.0 ❌ (나누기 전에 캐스팅해야!)
```

### 숫자 범위

```java
int max = Integer.MAX_VALUE;   // 2,147,483,647 (약 21억)
int overflow = max + 1;        // -2,147,483,648 (오버플로!)

long bigNum = 3_000_000_000L;  // L 붙여야 long (밑줄로 가독성)
```

---

## 3. Collections — 자료구조

### Python vs Java 대응표

| Python | Java (인터페이스) | Java (구현체) |
|--------|----------------|--------------|
| `list` | `List<T>` | `ArrayList<T>`, `LinkedList<T>` |
| `dict` | `Map<K,V>` | `HashMap<K,V>`, `LinkedHashMap<K,V>` |
| `set` | `Set<T>` | `HashSet<T>`, `LinkedHashSet<T>` |
| `tuple` | (없음) | `List.of()` (불변), record |
| `collections.deque` | `Deque<T>` | `ArrayDeque<T>` |

### List

```python
# Python
nums = [1, 2, 3]
nums.append(4)
nums[0]         # 1
len(nums)       # 4
```

```java
// Java
List<Integer> nums = new ArrayList<>();  // 가변
nums.add(4);
nums.get(0);    // 1 ([] 인덱싱 없음!)
nums.size();    // 4 (len() 없음!)

// 초기값 포함 생성
List<Integer> nums = new ArrayList<>(List.of(1, 2, 3));
nums.add(4);  // 가변

// 불변 리스트 (수정 불가)
List<Integer> fixed = List.of(1, 2, 3);
fixed.add(4);  // 💥 UnsupportedOperationException
```

### Map

```python
# Python
user = {"name": "Alice", "age": 30}
user["name"]          # "Alice"
user.get("email")     # None (키 없으면)
user["email"] = "a@b.com"
"name" in user        # True
```

```java
// Java
Map<String, Object> user = new HashMap<>();
user.put("name", "Alice");
user.put("age", 30);

user.get("name");           // "Alice"
user.get("email");          // null (키 없으면)
user.getOrDefault("email", "unknown");  // "unknown"
user.containsKey("name");   // true

// 불변 Map
Map<String, Integer> scores = Map.of("Alice", 95, "Bob", 87);
```

### Set

```python
# Python
tags = {"java", "backend", "java"}  # {"java", "backend"}
tags.add("kotlin")
"java" in tags  # True
```

```java
// Java
Set<String> tags = new HashSet<>();
tags.add("java");
tags.add("backend");
tags.add("java");   // 중복 무시
tags.contains("java");  // true

// 순서 유지가 필요하면
Set<String> ordered = new LinkedHashSet<>();
```

### 불변 vs 가변 — 핵심 규칙

```java
// ❌ 자주 하는 실수: List.of()는 불변
List<String> names = List.of("Alice", "Bob");
names.add("Charlie");  // 💥 UnsupportedOperationException

// ✅ 가변이 필요하면 new ArrayList<>() 감싸기
List<String> names = new ArrayList<>(List.of("Alice", "Bob"));
names.add("Charlie");  // OK
```

---

## 4. Strings — 문자열

### 기본 연산

```python
# Python
name = "Alice"
greeting = f"Hi, {name}!"
length = len(name)        # 5
upper = name.upper()
name[0]                   # "A"
name[1:3]                 # "li"
```

```java
// Java
String name = "Alice";
String greeting = String.format("Hi, %s!", name);  // f-string 대응
// 또는 (Java 15+)
String greeting = "Hi, %s!".formatted(name);

int length = name.length();   // 5 (len() 없음)
String upper = name.toUpperCase();
char first = name.charAt(0);  // 'A' (char 타입)
String sub = name.substring(1, 3);  // "li"
```

### 포맷 지시자

| 지시자 | 타입 | 예시 |
|--------|------|------|
| `%s` | String | `"Alice"` |
| `%d` | 정수 (int, long) | `42` |
| `%f` | 실수 | `3.140000` |
| `%.2f` | 소수점 2자리 | `3.14` |
| `%b` | boolean | `true` |
| `%n` | 줄바꿈 | (OS 독립적) |

```java
String.format("Name: %s, Age: %d, Score: %.2f", "Alice", 30, 98.5);
// "Name: Alice, Age: 30, Score: 98.50"
```

### String 불변성

```java
String s = "hello";
s.toUpperCase();   // s는 그대로 "hello"
s = s.toUpperCase();  // 새 String 반환받아야 함

// 반복 연결은 StringBuilder 사용
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 1000; i++) {
    sb.append(i);  // O(n) — String + 반복은 O(n²)
}
String result = sb.toString();
```

### 문자열 비교 — 중요!

```java
String a = "hello";
String b = "hello";
String c = new String("hello");

a == b       // true (문자열 풀 때문에 우연히)
a == c       // false (다른 객체 주소)
a.equals(c)  // true ✅ — 항상 equals() 사용
```

---

## 5. Stream API — 파이프라인

### Python list comprehension → Java Stream

```python
# Python
names = ["alice", "bob", "charlie"]
upper_names = [n.upper() for n in names if len(n) > 3]
# ["ALICE", "CHARLIE"]
```

```java
// Java
List<String> names = List.of("alice", "bob", "charlie");
List<String> upperNames = names.stream()
    .filter(n -> n.length() > 3)
    .map(String::toUpperCase)
    .collect(Collectors.toList());
// ["ALICE", "CHARLIE"]
```

### Stream 파이프라인 구조

```
소스 → [중간 연산] → [중간 연산] → 터미널 연산
```

**중간 연산** (lazy — 터미널 전까지 실행 안 됨):

| 연산 | 설명 | Python 대응 |
|------|------|------------|
| `filter(predicate)` | 조건 필터 | `filter()` / list comprehension `if` |
| `map(function)` | 변환 | `map()` / list comprehension |
| `sorted()` | 정렬 | `sorted()` |
| `limit(n)` | 앞 n개 | `[:n]` |
| `distinct()` | 중복 제거 | `set()` |
| `flatMap()` | 중첩 펼치기 | nested comprehension |

**터미널 연산** (실행 트리거):

| 연산 | 설명 | 반환 타입 |
|------|------|---------|
| `collect(Collectors.toList())` | 리스트로 수집 | `List<T>` |
| `count()` | 개수 | `long` |
| `sum()` | 합계 (IntStream) | `int` |
| `findFirst()` | 첫 번째 | `Optional<T>` |
| `anyMatch(p)` | 하나라도 조건 만족 | `boolean` |
| `allMatch(p)` | 모두 조건 만족 | `boolean` |
| `forEach(action)` | 각 요소 처리 | `void` |

### 지연 평가 (Lazy Evaluation) — 중요!

```java
// 터미널 연산이 없으면 아무것도 실행 안 됨
Stream<String> stream = names.stream()
    .filter(n -> {
        System.out.println("filtering: " + n);  // 출력 안 됨!
        return n.length() > 3;
    });
// 여기까지는 아무것도 안 함

stream.collect(Collectors.toList());  // 이제 실행됨
```

### mapToInt — 박싱 비용 절감

```java
List<Order> orders = List.of(new Order(100), new Order(200));

// map → Stream<Integer> (박싱 발생)
int sum1 = orders.stream()
    .map(Order::price)
    .reduce(0, Integer::sum);  // 박싱/언박싱 반복

// mapToInt → IntStream (원시 타입, 빠름)
int sum2 = orders.stream()
    .mapToInt(Order::price)
    .sum();  // ✅ 권장
```

### 실용 예제 모음

```java
List<User> users = ...;

// active 유저 이름만
List<String> activeNames = users.stream()
    .filter(User::isActive)
    .map(User::getName)
    .collect(Collectors.toList());

// 점수 top 3
List<String> top3 = players.stream()
    .sorted(Comparator.comparingInt(Player::score).reversed())
    .limit(3)
    .map(Player::name)
    .collect(Collectors.toList());

// 평균 점수
OptionalDouble avg = players.stream()
    .mapToInt(Player::score)
    .average();

// 이름으로 그룹핑
Map<String, List<Order>> byUser = orders.stream()
    .collect(Collectors.groupingBy(Order::userName));
```

---

## 6. Generics — 제네릭

### 왜 필요한가?

```java
// 제네릭 없으면
List list = new ArrayList();
list.add("hello");
String s = (String) list.get(0);  // 캐스팅 필요, 런타임 ClassCastException 위험

// 제네릭 있으면
List<String> list = new ArrayList<>();
list.add("hello");
String s = list.get(0);  // 캐스팅 불필요, 컴파일 타임 타입 체크
list.add(42);            // 컴파일 에러
```

### 제네릭 클래스

```python
# Python — 타입 힌트는 런타임에 무시
class Box(Generic[T]):
    def __init__(self):
        self.value = None
    def set(self, value: T):
        self.value = value
    def get(self) -> T:
        return self.value
```

```java
// Java — 컴파일 타임에 타입 강제
class Box<T> {
    private T value;

    public void set(T value) { this.value = value; }
    public T get() { return value; }
    public boolean isEmpty() { return value == null; }
}

Box<String> strBox = new Box<>();
strBox.set("hello");
strBox.set(42);       // 컴파일 에러

Box<Integer> intBox = new Box<>();
intBox.set(42);
```

### 제네릭 메서드

```java
// 메서드에도 타입 파라미터 선언 가능
public static <T> void swap(T[] arr, int i, int j) {
    T temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
}

// 바운디드 타입 파라미터
public static <T extends Comparable<T>> T max(T a, T b) {
    return a.compareTo(b) >= 0 ? a : b;
}

max(3, 7);           // 7
max("apple", "banana"); // "banana"
```

### 타입 소거 (Type Erasure)

**가장 중요한 gotcha!**

```java
// 컴파일 타임
List<String> strList = new ArrayList<>();
List<Integer> intList = new ArrayList<>();
strList.getClass() == intList.getClass();  // true! 런타임엔 둘 다 그냥 List

// 제네릭 타입으로 instanceof 불가
if (strList instanceof List<String>) { }  // 컴파일 에러

// 제네릭 배열 생성 불가
T[] arr = new T[10];  // 컴파일 에러

// 런타임에 T 알아야 하면 Class<T> 파라미터로 전달
public <T> T parse(String json, Class<T> clazz) {
    return objectMapper.readValue(json, clazz);
}
parse(json, User.class);  // 런타임에도 T = User 알 수 있음
```

### 와일드카드 (심화)

```java
// ? — 모든 타입 허용 (읽기 전용)
void printAll(List<?> list) {
    for (Object item : list) System.out.println(item);
}

// ? extends T — T의 서브타입 (상한 경계, 읽기)
double sum(List<? extends Number> numbers) {
    return numbers.stream().mapToDouble(Number::doubleValue).sum();
}

// ? super T — T의 슈퍼타입 (하한 경계, 쓰기)
void addNumbers(List<? super Integer> list) {
    list.add(1); list.add(2);
}
```

---

## 7. Null 처리

### Python None vs Java null

```python
# Python — None은 그냥 쓰면 됨
user = None
if user is None:
    print("no user")
name = user.name if user else "unknown"
```

```java
// Java — null은 NullPointerException(NPE) 위험
User user = null;
if (user == null) {
    System.out.println("no user");
}
String name = user != null ? user.getName() : "unknown";

// user.getName() — user가 null이면 💥 NPE
```

### Optional — NPE 방어

```java
// Optional로 null 안전하게 처리
Optional<User> optUser = userRepository.findById(id);

// 값 꺼내기
optUser.isPresent();          // null 아니면 true
optUser.isEmpty();            // null이면 true
optUser.get();                // 값 반환 (없으면 예외)
optUser.orElse(new User());   // 없으면 기본값
optUser.orElseThrow();        // 없으면 예외

// 체이닝
String name = optUser
    .map(User::getName)
    .orElse("unknown");
```

---

## 8. OOP — 클래스와 인터페이스

### Python ABC vs Java Interface

```python
# Python — ABC (Abstract Base Class)
from abc import ABC, abstractmethod

class Shape(ABC):
    @abstractmethod
    def area(self) -> float:
        pass
```

```java
// Java — Interface
interface Shape {
    double area();  // 자동으로 abstract
    
    default String describe() {  // 기본 구현 가능 (Java 8+)
        return "Area: " + area();
    }
}

class Circle implements Shape {
    private double radius;
    
    public Circle(double radius) { this.radius = radius; }
    
    @Override
    public double area() { return Math.PI * radius * radius; }
}
```

### record — Python dataclass 대응 (Java 16+)

```python
# Python
@dataclass
class User:
    name: str
    age: int
```

```java
// Java record — 불변 데이터 클래스
record User(String name, int age) {}

User user = new User("Alice", 30);
user.name();   // "Alice" (accessor 메서드, .name 아님!)
user.age();    // 30
```

### 접근 제한자

| | Python | Java |
|-|--------|------|
| public | 기본 | `public` |
| protected | `_` 관례 | `protected` |
| private | `__` 관례 | `private` |
| package | 없음 | 기본 (아무것도 안 붙임) |

---

## 9. Exceptions — 예외 처리

### Python vs Java 예외 구조

```python
# Python — 모든 예외가 unchecked
try:
    f = open("file.txt")
except FileNotFoundError as e:
    print(e)
finally:
    f.close()
```

```java
// Java — checked vs unchecked 구분
// Checked: 반드시 처리해야 함 (컴파일 에러)
try {
    FileReader f = new FileReader("file.txt");  // IOException (checked)
} catch (IOException e) {
    System.out.println(e.getMessage());
} finally {
    // 항상 실행
}

// try-with-resources (자동으로 close)
try (FileReader f = new FileReader("file.txt")) {
    // f 자동으로 닫힘
} catch (IOException e) {
    System.out.println(e);
}
```

### Checked vs Unchecked

```java
// Checked Exception — 처리 강제 (컴파일 에러)
// IOException, SQLException, ParseException 등
void readFile() throws IOException {  // 또는 try-catch
    ...
}

// Unchecked Exception — 처리 선택적 (RuntimeException 하위)
// NullPointerException, ArrayIndexOutOfBoundsException,
// IllegalArgumentException, ClassCastException 등
void divide(int a, int b) {
    if (b == 0) throw new IllegalArgumentException("b cannot be zero");
}
```

---

## 10. 자주 쓰는 패턴 치트시트

### 반복문

```python
# Python
for i in range(10):
    print(i)

for item in items:
    print(item)

for i, item in enumerate(items):
    print(i, item)
```

```java
// Java
for (int i = 0; i < 10; i++) {
    System.out.println(i);
}

for (String item : items) {  // enhanced for (for-each)
    System.out.println(item);
}

// 인덱스 포함
for (int i = 0; i < items.size(); i++) {
    System.out.println(i + " " + items.get(i));
}

// Stream으로
IntStream.range(0, 10).forEach(System.out::println);
```

### Comparator 정렬

```python
# Python
items.sort(key=lambda x: x.score, reverse=True)
```

```java
// Java
items.sort(Comparator.comparingInt(Item::score).reversed());

// Stream에서
items.stream()
    .sorted(Comparator.comparingInt(Item::score).reversed())
    ...

// 다중 정렬 기준
items.sort(Comparator.comparingInt(Item::score)
    .reversed()
    .thenComparing(Item::name));
```

### 조건 표현

```python
# Python ternary
result = "yes" if condition else "no"
```

```java
// Java ternary
String result = condition ? "yes" : "no";
```

### 메서드 레퍼런스

```java
// 람다 → 메서드 레퍼런스로 축약
.map(s -> s.toUpperCase())  →  .map(String::toUpperCase)
.map(u -> u.getName())      →  .map(User::getName)
.filter(s -> s.isEmpty())   →  .filter(String::isEmpty)
```

### 자주 쓰는 Integer/String 변환

```java
// String → int
int n = Integer.parseInt("42");

// int → String
String s = String.valueOf(42);
String s = Integer.toString(42);

// String → double
double d = Double.parseDouble("3.14");

// int → Integer (박싱)
Integer i = Integer.valueOf(42);
Integer i = 42;  // 오토박싱

// char → String
String s = String.valueOf('A');
String s = Character.toString('A');
```

---

> 마지막 업데이트: 2026-04-26
> 다음 추가 예정: OOP 패턴 (Strategy, Observer), Concurrency 기초
