## BigQuery

**인증:** `bq` CLI는 gcloud `credentials.db`를 직접 읽음 — `GOOGLE_APPLICATION_CREDENTIALS` 불필요.
`gcloud auth login`이 완료된 상태면 바로 사용 가능. (`application_default_credentials.json` 없어도 됨)

프로젝트 ID는 `~/.zshenv`의 `$PLAB_BQ_PROJECT`에 있다.

```bash
# 기본 쿼리 형식
# 작은따옴표는 변수가 확장되지 않으므로 큰따옴표를 쓰되, BigQuery 테이블 참조의
# 백틱은 반드시 \` 로 이스케이프한다 — 안 하면 셸이 명령치환으로 해석해 쿼리가 깨진다.
bq query --use_legacy_sql=false --format=json \
  "SELECT * FROM \`$PLAB_BQ_PROJECT.plab.TABLE_NAME\` LIMIT 10"

# 데이터셋/테이블 목록 확인
bq ls "$PLAB_BQ_PROJECT":
bq ls "$PLAB_BQ_PROJECT":plab
```

| 항목             | 값                                          |
| ---------------- | ------------------------------------------- |
| Project ID       | `$PLAB_BQ_PROJECT` (`~/.zshenv`)            |
| Dataset          | `plab`                                      |
| 테이블 참조 형식 | `` `$PLAB_BQ_PROJECT.plab.TABLE_NAME` ``    |
| 데이터 지연      | 약 15~20분 (RDS 대비)                       |

**쿼리 우선순위:**

1. **BigQuery 먼저** — IP 등록 불필요, 항상 접속 가능
2. **RDS replica로 전환** — BigQuery 결과가 불충분할 때 (실시간 데이터 필요, 최근 15~20분 이내 데이터 등)

## Database Connections

**IP 허용:** Slack에서 `@플래비 ip 등록`으로 임시 등록 (24시간 만료)

**자격증명은 `~/.zshenv` 환경변수에 있다. 저장소에 절대 쓰지 않는다.**
`PLAB_DB_HOST_MYSQL` `PLAB_MYSQL_USER` `PLAB_MYSQL_PASSWORD`
`PLAB_MYSQL_RO_USER` `PLAB_MYSQL_RO_PASSWORD`
`PLAB_DB_HOST_PG` `PLAB_PG_USER` `PLAB_PG_DB` `PLAB_PG_PASSWORD`

`~/.zshenv`는 비대화형 셸에도 자동 적용되므로 `source` 없이 바로 쓸 수 있다.
비어 있으면 셸을 새로 띄우거나 `source ~/.zshenv`.

```bash
# MySQL (plab replica, read-only)
# 비밀번호에 특수문자가 있어 커맨드라인 -p 대신 --defaults-extra-file 사용
umask 077
printf '[client]\nhost=%s\nport=3306\nuser=%s\npassword=%s\ndatabase=plab\n' \
  "$PLAB_DB_HOST_MYSQL" "$PLAB_MYSQL_USER" "$PLAB_MYSQL_PASSWORD" > /tmp/.my.cnf
mysql --defaults-extra-file=/tmp/.my.cnf -e "YOUR QUERY;"
rm -f /tmp/.my.cnf

# PostgreSQL (googwansa prod)
umask 077
printf '%s:5432:%s:%s:%s\n' \
  "$PLAB_DB_HOST_PG" "$PLAB_PG_DB" "$PLAB_PG_USER" "$PLAB_PG_PASSWORD" > /tmp/.pgpass
PGPASSFILE=/tmp/.pgpass psql -h "$PLAB_DB_HOST_PG" -p 5432 \
  -U "$PLAB_PG_USER" -d "$PLAB_PG_DB" -c "YOUR QUERY;"
rm -f /tmp/.pgpass
```

**heredoc 함정 — 이것 때문에 예전에 환경변수 방식이 실패했다.**

```bash
cat > /tmp/.my.cnf << 'EOF'     # ← delimiter에 따옴표가 있으면 변수가 확장되지 않는다
password=$PLAB_MYSQL_PASSWORD   # ← 이 문자열이 그대로 파일에 쓰여 인증 실패
EOF
```

따옴표를 떼면(`<< EOF`) 확장되지만, 위처럼 **`printf '%s'` 방식이 안전하다** — 비밀번호에
`$`, 백틱, 백슬래시가 있어도 그대로 기록된다. `umask 077`로 파일 생성 시점부터 권한을
막는다 (`chmod 600`은 생성과 chmod 사이에 짧은 노출 창이 있다).

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
