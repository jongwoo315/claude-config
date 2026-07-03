## BigQuery

**인증:** `bq` CLI는 gcloud `credentials.db`를 직접 읽음 — `GOOGLE_APPLICATION_CREDENTIALS` 불필요.
`gcloud auth login`이 완료된 상태면 바로 사용 가능. (`application_default_credentials.json` 없어도 됨)

```bash
# 기본 쿼리 형식
bq query --use_legacy_sql=false --format=json \
  'SELECT * FROM `plabfootball-51bf5.plab.TABLE_NAME` LIMIT 10'

# 데이터셋/테이블 목록 확인
bq ls plabfootball-51bf5:
bq ls plabfootball-51bf5:plab
```

| 항목             | 값                                         |
| ---------------- | ------------------------------------------ |
| Project ID       | `plabfootball-51bf5`                       |
| Dataset          | `plab`                                     |
| 테이블 참조 형식 | `` `plabfootball-51bf5.plab.TABLE_NAME` `` |
| 데이터 지연      | 약 15~20분 (RDS 대비)                      |

**쿼리 우선순위:**

1. **BigQuery 먼저** — IP 등록 불필요, 항상 접속 가능
2. **RDS replica로 전환** — BigQuery 결과가 불충분할 때 (실시간 데이터 필요, 최근 15~20분 이내 데이터 등)

## Database Connections

**IP 허용:** Slack에서 `@플래비 ip 등록`으로 임시 등록 (24시간 만료)

```bash
# MySQL (plab replica, read-only)
# 비밀번호의 ! 문자 때문에 --defaults-extra-file 방식 사용
cat > /tmp/.my.cnf << 'EOF'
[client]
host=plab3-replica.ct9mlhi5xnrs.ap-northeast-2.rds.amazonaws.com
port=3306
user=u_jongwoo.kim
password=***REMOVED-CREDENTIAL***
database=plab
EOF
chmod 600 /tmp/.my.cnf
mysql --defaults-extra-file=/tmp/.my.cnf -e "YOUR QUERY;"
rm -f /tmp/.my.cnf

# PostgreSQL (googwansa prod)
# 비밀번호의 ! 문자 때문에 .pgpass 방식 사용
echo "plab-product-prod.ct9mlhi5xnrs.ap-northeast-2.rds.amazonaws.com:5432:plab_product:plab:***REMOVED-CREDENTIAL***" > /tmp/.pgpass
chmod 600 /tmp/.pgpass
PGPASSFILE=/tmp/.pgpass psql -h plab-product-prod.ct9mlhi5xnrs.ap-northeast-2.rds.amazonaws.com -p 5432 -U plab -d plab_product -c "YOUR QUERY;"
rm -f /tmp/.pgpass
```

**plab DB 테이블 네이밍 규칙:**
Django 기본 `app_label_model` 대신 **모델명만** 사용 (`Meta.db_table` 설정):

| Django Model        | 실제 테이블명  | Django 기본값 (사용 안 함) |
| ------------------- | -------------- | -------------------------- |
| `match.Match`       | `match`        | ~~match_match~~            |
| `match.MatchApply`  | `match_apply`  | ~~match_matchapply~~       |
| `match.MatchDetail` | `match_detail` | ~~match_matchdetail~~      |
| `accounts.User`     | `auth_user`    | (Django auth 기본)         |

Raw SQL 작성 시 반드시 실제 테이블명 확인할 것.

**테이블명·컬럼명 확인 방법 (Django shell):**

추측 금지. Raw SQL 전에 아래 명령으로 반드시 확인.

```bash
# Python 환경 감지 후 실행
cd web && source ../.venv/bin/activate 2>/dev/null || true
python manage.py shell -c "
from django.apps import apps
app, model_name = 'accounts', 'Profile'   # ← 앱/모델명 변경
Model = apps.get_model(app, model_name)
print('테이블:', Model._meta.db_table)
print('필드 → 실제 컬럼:')
for f in Model._meta.get_fields():
    if hasattr(f, 'column'):
        print(f'  {f.name:30s} → {f.column}')
"
```

**흔한 함정:**

- `profile` ✗ → `auth_user_profile` ✓ (`Meta.db_table` 커스텀)
- FK `match_apply_id` ✗ → `match_apply` ✓ (`db_column='match_apply'` 설정 시 `_id` 없음)
- 테이블명/컬럼명은 항상 `_meta` API로 확인. 추측으로 쓰면 `Unknown column` 에러 발생
