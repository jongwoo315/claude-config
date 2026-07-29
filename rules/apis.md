## Notion API

- `~/work/*`, `~/plab/*` 또는 plab/plabfootball 관련 Notion 페이지 → `PLAB_NOTION_API_KEY`
- `~/prv/*` 및 그 외 → `NOTION_API_KEY`

### 자주 쓰는 페이지

| 페이지        | 용도                        | Database ID                            |
| ------------- | --------------------------- | -------------------------------------- |
| 프로젝트 진행 | 개인 태스크 트래킹 (DEV-xx) | `29241e61-65c0-801f-9529-cabf8cad919b` |
| Dev Scraps    | TIL, 개념 정리, 기술 스크랩 | `76e9673e-d91b-41b2-9779-c0940040f542` |

**프로젝트 작업 컨텍스트에서는 "프로젝트 진행" 페이지를 최우선으로 참고할 것.**

### Notion 검색

- 태스크 검색 시 프로퍼티 기반 조회 사용 (제목 검색 대신)
- 예: `프로젝트`, `상태`, `ID` 프로퍼티로 필터링

### 페이지 작성 포맷

- h2, h3, bullet 사용
- division line (구분선) 사용 금지

## Jira API

- Email: `$PLAB_WORK_EMAIL` / Server: `$PLAB_JIRA_HOST` — 둘 다 `~/.zshenv`.
  `~/.zshenv`는 비대화형 셸에도 자동 적용돼 `source` 없이 값이 보인다.
  (구 규칙 "`$JIRA_EMAIL` env var 금지, 하드코딩할 것"은 폐기 — 당시엔 그 변수가
  zshenv에 정의돼 있지 않아 빈 값이었던 것이지 전달 자체가 문제가 아니었다.)
  비었으면 하드코딩하지 말고 `printenv PLAB_WORK_EMAIL`로 먼저 확인할 것.
- **IMPORTANT:** Use `/rest/api/3/search/jql` instead of deprecated `/rest/api/3/search`
- **Priority 설정:** name 대신 **ID 사용** (name에 비표준 문자 포함 시 실패). ID 매핑: `1`=Critical, `2`=High, `3`=Medium, `4`=Low

```bash
# Correct - use search/jql endpoint
# IMPORTANT: pipe to jq to bypass RTK rewrite (RTK curl wrapper breaks -u auth)
curl -s -u "$PLAB_WORK_EMAIL:$JIRA_API_TOKEN" \
  "https://$PLAB_JIRA_HOST/rest/api/3/search/jql?jql=assignee=currentUser()+ORDER+BY+updated+DESC&maxResults=5" \
  | jq .
```

## AWS Credentials

**프로파일 전환 규칙 (모든 AWS CLI/SDK 사용 전 필수):**

| 디렉토리               | AWS Profile | 용도               |
| ---------------------- | ----------- | ------------------ |
| `~/work/*`, `~/plab/*` | `plab`      | $PLAB_GH_ORG 업무 |
| 그 외                  | `default`   | 기본값             |

```bash
# ~/work/ 또는 ~/plab/ 에서
AWS_PROFILE=plab aws ...

# 그 외
aws ...  # default profile 사용
```
