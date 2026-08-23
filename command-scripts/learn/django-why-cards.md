# Django Why Cards — Content

---

## django-orm — ORM / QuerySet 지연 평가

### Why Story

Django ORM은 SQL을 직접 쓰지 않아도 Python 코드로 DB를 다룰 수 있게 해줌.
핵심은 **지연 평가(lazy evaluation)** — QuerySet은 실제로 DB에 쿼리를 날리지 않고 조건을 쌓아만 둠.

```python
users = User.objects.filter(is_active=True)   # 쿼리 안 날아감
users = users.filter(age__gte=18)              # 아직 안 날아감
result = list(users)                            # 여기서 DB 접근
```

🧠 핵심: QuerySet은 "쿼리 설계도". 실제 실행은 iterate/슬라이싱/len() 때만.
이 덕분에 조건을 단계적으로 조립 가능 (함수 분리, 조건 추가 등).

### 💥 What Breaks Without It?

```python
def get_active_users():
    return User.objects.filter(is_active=True)

users = get_active_users()
# 이 시점에 DB 쿼리가 이미 실행됐다면?
users = users.filter(age__gte=18)  # 추가 필터링 불가
```

→ 지연 평가 없으면 체이닝 불가. 매 조건마다 새 쿼리 필요. N개 조건 = N번 DB 접근.

---

## django-migrations — 마이그레이션

### Why Story

Django 모델은 Python 클래스. DB 스키마는 실제 테이블.
이 둘의 **변경 이력을 동기화**하는 게 Migration.

마이그레이션 없이 모델을 바꾸면 → Python 코드와 DB 스키마가 어긋남 → 런타임 에러.

```bash
python manage.py makemigrations  # 변경사항 감지 → 파일 생성
python manage.py migrate         # 파일 기반으로 DB 실제 변경
```

🧠 핵심: 마이그레이션 파일 = DB 스키마 변경 이력. git으로 협업 시 팀원 모두 동일한 스키마 유지 가능.

### 💥 What Breaks Without It?

```python
class User(models.Model):
    name = models.CharField(max_length=100)
    # 새로 추가
    email = models.EmailField()
```

makemigrations 없이 바로 `User.objects.create(email=...)` 실행 →
`OperationalError: table auth_user has no column named email`

---

## django-views — Class-Based View (CBV)

### Why Story

FBV(함수 기반 뷰)로 CRUD 만들면 GET/POST 분기를 if문으로 처리:

```python
def user_view(request, pk):
    if request.method == 'GET':
        ...
    elif request.method == 'POST':
        ...
    elif request.method == 'DELETE':
        ...
```

CBV는 HTTP 메서드별로 메서드를 분리:

```python
class UserView(View):
    def get(self, request, pk): ...
    def post(self, request, pk): ...
    def delete(self, request, pk): ...
```

🧠 핵심: CBV는 재사용을 위한 구조. `ListView`, `DetailView`, `CreateView` 등 제네릭 뷰가 보일러플레이트 대부분 처리.

### 💥 What Breaks Without It?

```python
def product_view(request, pk):
    if request.method == 'GET':
        product = get_object_or_404(Product, pk=pk)
        return render(request, 'detail.html', {'product': product})
    elif request.method == 'POST':
        ...
    # DELETE, PUT, PATCH 추가 시 if-elif 계속 늘어남
```

→ 메서드 많아질수록 함수 비대해짐. 인증/권한 체크 로직 중복. CBV mixin으로 해결.

---

## django-middleware — 미들웨어

### Why Story

모든 요청이 뷰에 도달하기 전, 응답이 클라이언트에게 가기 전 — **공통 처리**가 필요할 때.
인증 확인, 로깅, CORS 헤더, 세션 처리 등.

미들웨어는 요청/응답이 통과하는 **파이프라인**:

```
Request → Middleware1 → Middleware2 → View → Middleware2 → Middleware1 → Response
```

```python
# settings.py
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    ...
]
```

🧠 핵심: 미들웨어 순서 중요. 위에서 아래로 요청 처리, 아래에서 위로 응답 처리.

### 💥 What Breaks Without It?

인증 미들웨어 없이 `request.user` 접근 →
`AttributeError: 'WSGIRequest' object has no attribute 'user'`

또는 CORS 미들웨어 없이 프론트엔드 요청 → 브라우저 CORS 에러.

---

## django-signals — 시그널

### Why Story

모델 저장 후 이메일 발송, 캐시 무효화 등 — **다른 앱 코드에서 이벤트를 구독**해야 할 때.
직접 호출하면 앱 간 결합도가 높아짐.

```python
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=User)
def send_welcome_email(sender, instance, created, **kwargs):
    if created:
        send_email(instance.email)
```

🧠 핵심: 시그널 = 발행-구독 패턴. `User` 모델이 이메일 발송 로직을 몰라도 됨. 느슨한 결합.

### 💥 What Breaks Without It?

```python
def create_user(data):
    user = User.objects.create(**data)
    send_welcome_email(user.email)   # User 생성 로직에 이메일 로직 직접 결합
    update_analytics(user)           # 기능 추가마다 여기 수정
    invalidate_cache(user)
```

→ User 생성 함수가 모든 사이드 이펙트를 알아야 함. 기능 추가마다 핵심 코드 수정.

---

## django-rest — DRF Serializer

### Why Story

Django 모델 데이터를 JSON으로 변환하거나, JSON 입력을 모델로 변환할 때 — **직렬화/역직렬화**가 필요.
Serializer는 이걸 선언적으로 처리:

```python
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']

# 직렬화
serializer = UserSerializer(user)
data = serializer.data  # {'id': 1, 'username': 'jw', 'email': '...'}

# 역직렬화 + 유효성 검사
serializer = UserSerializer(data=request.data)
if serializer.is_valid():
    serializer.save()
```

🧠 핵심: Serializer = 입출력 계층. 유효성 검사 + 변환을 한 곳에서. 뷰는 비즈니스 로직만.

### 💥 What Breaks Without It?

```python
def create_user(request):
    data = json.loads(request.body)
    # 유효성 검사 직접 구현
    if not data.get('email'):
        return JsonResponse({'error': 'email required'}, status=400)
    if not re.match(r'...', data['email']):
        return JsonResponse({'error': 'invalid email'}, status=400)
    # 더 많은 필드... 중복 검사 로직 폭발
```

→ 필드 추가마다 뷰에서 검사 로직 추가. 재사용 불가. Serializer로 분리하면 뷰는 깔끔해짐.

---

## django-n1 — N+1 쿼리 문제

### Why Story

연관된 모델을 반복문에서 접근할 때 N+1 쿼리가 발생함:

```python
# N+1 — orders 1번 + 각 order의 user N번 = N+1 쿼리
orders = Order.objects.all()
for order in orders:
    print(order.user.name)  # 매번 DB 접근
```

`select_related` (FK/OneToOne) 또는 `prefetch_related` (M2M/역방향)로 해결:

```python
# select_related: JOIN으로 한 번에
orders = Order.objects.select_related('user').all()
# prefetch_related: 별도 쿼리 but 1번만
orders = Order.objects.prefetch_related('tags').all()
```

🧠 핵심: ORM은 지연 평가라 반복문 안 접근이 각각 쿼리를 날림. 미리 JOIN해서 막아야 함.

### 💥 What Breaks Without It?

```python
posts = Post.objects.all()  # 쿼리 1번
for post in posts:
    print(post.author.name)    # 쿼리 N번
    for tag in post.tags.all(): # 쿼리 N번 더
        print(tag.name)
```

→ 100개 게시글 = 201+ 쿼리. 트래픽 늘면 DB 과부하. Django Debug Toolbar로 확인 가능.
