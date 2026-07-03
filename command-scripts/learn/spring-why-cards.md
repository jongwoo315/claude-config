# Spring Why Cards — 통근용 개념 카드

각 토픽: Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나)

---

## spring-di — 의존성 주입 (Dependency Injection)

### Why Story
Django에선 뷰 함수 안에서 직접 `UserService()` 인스턴스 만들어 씀.
```python
# Django 방식
def my_view(request):
    service = UserService(db=MyDatabase())  # 직접 생성
    return service.get_user(request.user.id)
```
테스트할 때 문제 생김: `UserService`가 `MyDatabase`를 직접 참조하니까 테스트에서 실제 DB 연결 필요.

Spring은 반대로 함. **"나는 UserService 필요해요"라고 선언만 하면, Spring이 알아서 만들어서 줌.**
```java
@Service
public class OrderService {
    private final UserService userService;  // 직접 만들지 않음

    public OrderService(UserService userService) {  // Spring이 넣어줌
        this.userService = userService;
    }
}
```
이게 DI. Spring이 오브젝트 생명주기를 관리하는 컨테이너(IoC Container) 역할.

🐍 Django로 치면: `@inject` 데코레이터로 view에 service 주입하는 것. 근데 Django는 기본 지원 안 함.

🧠 핵심 멘탈 모델: **"내가 만드는 게 아니라 받는 것"** — 생성 책임을 프레임워크에 위임.

### 💥 What Breaks Without It?
아래 코드에서 DI 없으면 어떤 문제가 생길까?
```java
public class OrderService {
    private UserService userService = new UserService(new JdbcUserRepository());

    public void placeOrder(Long userId) {
        User user = userService.findById(userId);
    }
}
```
→ `OrderService` 테스트할 때 실제 DB 필요. `UserService` 구현 바꾸면 `OrderService` 코드도 바꿔야 함. 싱글톤 보장 안 됨.

---

## spring-mvc — 요청 처리 흐름

### Why Story
Django에서 요청이 오면: URL → view 함수 → response.
Spring MVC도 비슷한데 중간에 더 많은 레이어 있음.

```
HTTP 요청
    ↓
DispatcherServlet (프론트 컨트롤러 — 모든 요청의 단일 진입점)
    ↓
HandlerMapping (이 URL은 어느 Controller?)
    ↓
Controller (실제 비즈니스 로직 호출)
    ↓
ViewResolver (결과를 어떻게 렌더링?)
    ↓
HTTP 응답
```

`@RestController` = `@Controller` + `@ResponseBody`. JSON 직접 반환할 때.
`@RequestMapping("/api/orders")` 클래스 레벨에 붙이면 → 모든 메서드 URL에 prefix 붙음.

🐍 Django로 치면: `urls.py` + `views.py` = Spring의 `@RequestMapping` + `@Controller`

🧠 핵심 멘탈 모델: **DispatcherServlet이 교통 경찰** — 모든 요청을 받아서 올바른 핸들러로 라우팅.

### 💥 What Breaks Without It?
`@RequestBody` 없이 POST body를 받으면 어떻게 될까?
```java
@PostMapping("/orders")
public void createOrder(OrderRequest request) {  // @RequestBody 빠짐
}
```
→ `request`는 null. Body가 자동으로 매핑 안 됨. `@RequestBody`가 있어야 Jackson이 JSON → 객체 변환.

---

## spring-validation — 입력값 검증

### Why Story
Django Form에서 `is_valid()` 호출해서 검증했지? Spring은 어노테이션으로 선언.

```java
public record OrderRequest(
    @NotNull Long userId,
    @Min(1) int quantity,
    @Size(max=500) String memo
) {}

@PostMapping("/orders")
public ResponseEntity<?> createOrder(@Valid @RequestBody OrderRequest request) {
    // @Valid 있으면 → 검증 자동 실행
    // 실패하면 → MethodArgumentNotValidException 자동 throw
}
```

`@Valid` 없으면 어노테이션 붙여놔도 검증 안 됨. 선언만 하고 활성화 안 한 것.

🐍 Django로 치면: `ModelForm` + `clean()` 메서드.

🧠 핵심 멘탈 모델: **"선언(DTO) + 활성화(@Valid) 두 개 다 필요"** — 둘 중 하나만 있으면 동작 안 함.

### 💥 What Breaks Without It?
```java
@PostMapping("/orders")
public ResponseEntity<?> createOrder(@RequestBody OrderRequest request) {
    // @Valid 없음!
    orderService.createOrder(request);
}
```
→ `quantity = -999`, `userId = null`로 들어와도 통과. DB 레벨에서 에러 터짐.

---

## spring-error-handling — 전역 예외 처리

### Why Story
매 Controller마다 try-catch 쓰면 중복:
```java
@GetMapping("/orders/{id}")
public Order getOrder(@PathVariable Long id) {
    try {
        return orderService.findById(id);
    } catch (OrderNotFoundException e) {
        // 모든 컨트롤러에 이 코드 반복...
    }
}
```

`@RestControllerAdvice` + `@ExceptionHandler`로 한 곳에서:
```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(OrderNotFoundException e) {
        return ResponseEntity.status(404).body(new ErrorResponse(e.getMessage()));
    }
}
```

🐍 Django로 치면: `EXCEPTION_MIDDLEWARE` 또는 `handler404` 커스텀.

🧠 핵심 멘탈 모델: **예외 처리 로직 중앙화** — 비즈니스 코드와 에러 처리 코드 분리.

### 💥 What Breaks Without It?
`@ControllerAdvice` 없고 exception throw하면?
→ Spring 기본 에러 응답. `{"timestamp":...,"status":500}` 형태 — 프론트가 파싱 못하는 형식 or HTML 에러 페이지.

---

## spring-test — 테스트

### Why Story
Spring 테스트의 핵심: 얼마나 많이 띄우냐 = 얼마나 느리냐.

```
@SpringBootTest        : 전체 컨텍스트 로드. 통합 테스트. 느림.
@WebMvcTest            : Controller 레이어만. MockMvc. 빠름.
@DataJpaTest           : JPA 레이어만. H2 인메모리 DB. 빠름.
@ExtendWith(Mockito)   : Spring 컨텍스트 없음. 제일 빠름.
```

🐍 Django로 치면: `TestCase` vs `SimpleTestCase`. DB 필요하면 `TestCase`, 아니면 `SimpleTestCase`.

🧠 핵심 멘탈 모델: **테스트 범위 = 속도 trade-off** — 좁을수록 빠름. 필요한 최소 범위만 로드.

### 💥 What Breaks Without It?
`@WebMvcTest(OrderController.class)` 쓰는데 `OrderService`를 `@MockBean` 안 하면?
→ `OrderService` bean 못 찾아서 컨텍스트 로드 실패. `@WebMvcTest`는 Service 레이어 안 띄움.

---

## jpa-entity — 엔티티 설계

### Why Story
Django `Model` = JPA `@Entity`. 핵심 차이:

```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)  // MySQL auto_increment
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)  // 명시적 LAZY 필수!
    @JoinColumn(name = "user_id")
    private User user;
}
```

- Django는 FK fetch 자동. JPA는 `fetch = LAZY` 직접 써줘야 N+1 안 생김.
- `@ManyToOne` 기본이 `EAGER` — 항상 `LAZY` 명시.
- PK는 `Long`. `int`는 2억 넘으면 오버플로우.

🧠 핵심 멘탈 모델: **JPA는 기본값 믿지 마라** — `@ManyToOne` 기본이 EAGER. 항상 LAZY 명시.

### 💥 What Breaks Without It?
```java
@ManyToOne  // fetch 미지정 = EAGER
private User user;
```
→ `Order` 100개 조회 = 자동으로 `User` 100번 쿼리. N+1. 운영 DB 폭격.

---

## jpa-repository — 데이터 접근 레이어

### Why Story
**인터페이스로 선언만 하면 구현 자동 생성.**

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByUserId(Long userId);                               // 구현 코드 0줄
    List<Order> findByStatusAndCreatedAtAfter(OrderStatus s, LocalDateTime t);

    @Query("SELECT o FROM Order o WHERE o.totalAmount > :amount")
    List<Order> findExpensive(@Param("amount") BigDecimal amount);
}
```

`findBy` + 필드명 = Spring Data가 메서드명 파싱해서 자동 쿼리 생성.

🐍 Django로 치면: `Manager` + `QuerySet`. 근데 Spring은 인터페이스만 있으면 됨.

🧠 핵심 멘탈 모델: **메서드명 = 쿼리 선언** — 복잡도 올라가면 `@Query`로 전환.

### 💥 What Breaks Without It?
`findByUser_Name()` vs `findByUserName()` — 차이는?
→ `findByUser_Name()` : User 엔티티의 name 필드로 JOIN. `findByUserName()` : Order 엔티티에 `userName` 필드가 있다고 해석 → 없으면 에러.

---

## jpa-relations — 연관관계

### Why Story
RDB에서 FK는 `orders.user_id`가 가짐. JPA에서도 FK 관리하는 쪽 = **연관관계 주인(Owner)**.

```java
// Order (FK owner — user_id 컬럼 가짐)
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "user_id")
private User user;

// User (반대편 — mappedBy = 주인이 아님)
@OneToMany(mappedBy = "user")  // "user" = Order의 필드명
private List<Order> orders = new ArrayList<>();
```

`mappedBy` 있는 쪽 = 주인 아님 = 이쪽에서 값 바꿔도 DB 반영 안 됨.

🧠 핵심 멘탈 모델: **FK 컬럼 가진 쪽 = 연관관계 주인** — mappedBy 있는 쪽은 읽기 전용.

### 💥 What Breaks Without It?
```java
user.getOrders().add(order);  // mappedBy 쪽에 추가
// save 해도 order.user_id가 DB에 안 들어감!
```
→ 연관관계 주인(`order.setUser(user)`)에서 설정해야 함. 편의 메서드로 양쪽 모두:
```java
public void addOrder(Order order) {
    orders.add(order);
    order.setUser(this);
}
```

---

## jpa-query — JPQL & N+1 해결

### Why Story
SQL은 테이블 대상. JPQL은 **엔티티 객체** 대상.

```java
// SQL (테이블명, 컬럼명)
SELECT * FROM orders WHERE user_id = 1

// JPQL (클래스명, 필드명)
SELECT o FROM Order o WHERE o.user.id = 1
```

N+1 해결 — fetch join:
```java
@Query("SELECT o FROM Order o JOIN FETCH o.user WHERE o.status = :status")
List<Order> findWithUser(@Param("status") OrderStatus status);
```
`JOIN FETCH` = 쿼리 1번으로 Order + User 한번에 가져옴.

🐍 Django로 치면: `select_related()` = JOIN FETCH.

🧠 핵심 멘탈 모델: **JPQL은 SQL 아님** — 테이블명/컬럼명 쓰면 에러. 클래스명/필드명.

### 💥 What Breaks Without It?
```java
List<Order> orders = orderRepository.findAll();
for (Order order : orders) {
    order.getUser().getName();  // LAZY 로딩
}
```
→ orders 100개면 쿼리 101번. `JOIN FETCH`로 해결.

---

## querydsl — 타입 안전 동적 쿼리

### Why Story
검색 조건이 동적일 때 JPQL 한계:
```java
String jpql = "SELECT o FROM Order o WHERE 1=1";
if (status != null) jpql += " AND o.stauts = :status";  // 오타! 런타임에 발견
```

QueryDSL은 **컴파일 타임 검증**:
```java
QOrder order = QOrder.order;
BooleanBuilder builder = new BooleanBuilder();

if (status != null) builder.and(order.status.eq(status));
if (userId != null) builder.and(order.user.id.eq(userId));

return queryFactory.selectFrom(order).where(builder).fetch();
```
`order.stauts` 자체가 컴파일 에러. IDE 자동완성도 됨.

🐍 Django로 치면: `Q()` 객체 동적 조합. 근데 Django는 문자열 필드명이라 오타 런타임 발견.

🧠 핵심 멘탈 모델: **QueryDSL = 타입 안전한 SQL 빌더** — 쿼리 버그를 컴파일 시점에 잡음.

### 💥 What Breaks Without It?
동적 조건 5개 있는 검색 API를 JPQL 문자열로 만들면?
→ 조건 조합마다 if-else로 jpql 문자열 조합. 가독성 최악. 실수하기 쉬움. QueryDSL은 조건 메서드 조합으로 깔끔하게.

---

## jpa-performance — JPA 성능 최적화

### Why Story
JPA 쓰다 보면 쿼리가 예상보다 많이 나감. 주요 원인:

**1. N+1** — JOIN FETCH 또는 `@EntityGraph`로 해결.

**2. Dirty Checking 의도치 않게 발생**
```java
@Transactional
public void readOrder(Long id) {
    Order order = orderRepository.findById(id).orElseThrow();
    // 읽기만 하려 했는데 실수로 setter 호출하면 → UPDATE 쿼리 나감
}
```
→ 읽기 전용이면 `@Transactional(readOnly = true)` 써라. Dirty checking 비활성화 + 성능 최적화.

**3. 배치 처리 시 메모리 폭발**
→ `Pageable`로 청크 단위 처리.

🧠 핵심 멘탈 모델: **트랜잭션 = 변경 감지 범위** — `@Transactional` 안에서 엔티티 바꾸면 자동 UPDATE.

### 💥 What Breaks Without It?
```java
// @Transactional 없음
public void updateStatus(Long id, OrderStatus status) {
    Order order = orderRepository.findById(id).orElseThrow();
    order.setStatus(status);
    // UPDATE 쿼리 안 나감!
}
```
→ Dirty checking은 `@Transactional` 안에서만 동작. 없으면 명시적 `save()` 필요.

---

## spring-security — 인증/인가

### Why Story
Django `@login_required` = view 레벨 보호.
Spring Security = **Filter Chain** 방식 — Controller 도달 전에 필터에서 차단.

```
HTTP 요청
    ↓
SecurityFilterChain
    ├── JwtAuthenticationFilter (토큰 추출 + 검증)
    └── ... 여러 필터
    ↓
DispatcherServlet
    ↓
Controller
```

JWT 흐름:
1. 헤더에서 `Authorization: Bearer <token>` 추출
2. 서명 검증 (위조 확인)
3. 토큰에서 userId 파싱
4. `UsernamePasswordAuthenticationToken` 생성
5. `SecurityContextHolder.getContext().setAuthentication(token)` 저장
6. Controller에서 `@AuthenticationPrincipal`로 꺼내 씀

`SecurityContextHolder`가 ThreadLocal 쓰는 이유: 요청마다 독립 스레드. 다른 요청 인증 정보와 섞이면 안 됨.

🐍 Django로 치면: `request.user` = Spring의 `SecurityContextHolder.getContext().getAuthentication()`

🧠 핵심 멘탈 모델: **인증 정보는 ThreadLocal** — 요청 시작 시 저장, 끝날 때 자동 클리어.

### 💥 What Breaks Without It?
```java
// JwtAuthenticationFilter에서 SecurityContextHolder 설정 안 하면?
@GetMapping("/profile")
public UserProfile getProfile(@AuthenticationPrincipal UserDetails user) {
    // user = null! SecurityContext에 아무것도 없음
}
```
→ `@AuthenticationPrincipal`은 SecurityContext에서 꺼냄. 필터에서 설정 안 하면 null.

---

## 사용법

Telegram: `"spring-di 왜"` / `"왜 카드"` / `"[토픽] why"` → 해당 토픽 카드 전송
