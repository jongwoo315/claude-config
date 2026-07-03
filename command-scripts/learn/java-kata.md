# Java/Kotlin Kata Topics

## Level 1: Java Basics (Month 1)

| Topic | Key Concepts | Python Comparison |
|-------|-------------|-------------------|
| types | 원시 타입, 박싱, var | Python은 모두 객체 |
| collections | List, Map, Set, 불변 vs 가변 | list/dict/set과 매핑 |
| stream | filter, map, reduce, collect | list comprehension, generator |
| generics | 타입 파라미터, 와일드카드, 타입 소거 | Python 타입힌트와 차이 |
| exceptions | checked vs unchecked, try-with-resources | Python은 unchecked만 |
| oop | 인터페이스, 추상클래스, 다형성 | ABC, Protocol, duck typing |
| concurrency | Thread, synchronized, volatile | threading, GIL 차이 |
| functional | 람다, Function/Consumer/Supplier | lambda, functools |

## Level 2: Kotlin (Month 2)

| Topic | Key Concepts | Java Comparison |
|-------|-------------|-----------------|
| null-safety | ?, !!, ?., ?: (elvis), let/run | Java Optional vs Kotlin nullable |
| data-class | data class, copy(), destructuring | Java record, Python dataclass |
| extensions | 확장 함수, 확장 프로퍼티 | Java에 없음, Python monkey-patch |
| coroutines | suspend, launch, async/await, Flow | Java CompletableFuture, Python asyncio |
| sealed | sealed class/interface, when 분기 | Java sealed class (17+) |
| scope-functions | let, run, with, apply, also | Python 없음 (컨텍스트 매니저와 유사점) |
| collections-kt | 불변/가변 구분, 시퀀스, 컬렉션 함수 | Java Stream vs Kotlin Sequence |
| dsl | 타입 안전 빌더, 수신 객체 람다 | Java builder 패턴 대체 |

## Level 3: Spring/JVM (Month 3+)

| Topic | Key Concepts | Django Comparison |
|-------|-------------|-------------------|
| spring-di | @Component, @Service, @Autowired, 생성자 주입 | Django 없음 (모듈 임포트) |
| spring-mvc | @RestController, @RequestMapping, ResponseEntity | DRF ViewSet, Serializer |
| jpa-basics | @Entity, @Repository, JPQL, 영속성 컨텍스트 | Django ORM Model, QuerySet |
| jpa-relations | @OneToMany, @ManyToOne, fetch 전략, N+1 | ForeignKey, prefetch_related |
| spring-test | @SpringBootTest, @MockBean, MockMvc | pytest-django, APIClient |
| spring-security | SecurityFilterChain, JWT, OAuth2 | DRF auth, django-allauth |
| querydsl | BooleanBuilder, 동적 쿼리 | Django Q objects, django-filter |
| spring-aop | @Aspect, @Around, @Transactional 동작원리 | decorator, middleware |

## Kata Difficulty

| Level | Description | Example |
|-------|-------------|---------|
| warm-up | 문법 확인, 5분 내 풀이 | 리스트 정렬 후 그룹핑 |
| practice | 개념 적용, 15분 내 | 제네릭 유틸 함수 작성 |
| challenge | 복합 개념, 30분 | 스트림+제네릭으로 데이터 파이프라인 |
