# 스캐너 명령 레퍼런스

`✅ 검증됨` = 실제 실행 확인. `⚠️ 미검증` = 실행 전 `--help`로 플래그 확인할 것.

## Prowler (AWS) ✅ 검증됨 — v5.36.0

전역 파이썬 오염을 피해 전용 venv에 설치한다 (pyenv shims 오염 금지).

```bash
mkdir -p ~/isms && cd ~/isms
python3 -m venv .venv
./.venv/bin/pip install -q --upgrade pip
./.venv/bin/pip install prowler
./.venv/bin/prowler --version
```

### ISMS-P 프레임워크 키

```bash
./.venv/bin/prowler aws --list-compliance | grep -iE "isms|kisa"
```

| 키 | 내용 |
| --- | --- |
| `kisa_isms_p_2023_korean_aws` | 인증기준 한글명 — 심사 증적용 |
| `kisa_isms_p_2023_aws` | 영문 |

둘 다 지정하면 리포트 2종이 함께 생성된다.

### 실행

```bash
cd ~/isms && AWS_PROFILE=<profile> ./.venv/bin/prowler aws \
  --region ap-northeast-2 \
  --compliance kisa_isms_p_2023_korean_aws kisa_isms_p_2023_aws \
  --output-formats csv html json-ocsf \
  --output-directory ~/isms/scan-<MMDD> \
  --no-banner --ignore-exit-code-3
```

- `--compliance`는 리포트 생성 대상만 지정. 체크는 전체가 돌아간다.
- `--ignore-exit-code-3` 없으면 FAIL 존재 시 exit 3.
- 단일 리전도 수 분 이상 소요 → `run_in_background: true`.
- 전체 리전은 30분+. ISMS 전수조사 취지엔 맞지만 시간 확보 후 실행.

### 출력

```
~/isms/scan-<MMDD>/
├── prowler-output-<acct>-<ts>.html      ← 사람이 브라우저로 탐색
├── prowler-output-<acct>-<ts>.csv       ← 전체 findings (구분자 `;`)
├── prowler-output-<acct>-<ts>.ocsf.json ← 매우 큼
└── compliance/
    └── ..._kisa_isms_p_2023_korean_aws.csv   ← 인증기준 매핑
```

**실측 920MB.** CSV/JSON을 Read로 직접 열지 말 것 — `analyze_prowler.py` 사용.

### CSV 주요 컬럼

`CHECK_ID` `CHECK_TITLE` `STATUS` `STATUS_EXTENDED` `SEVERITY` `SERVICE_NAME`
`RESOURCE_UID` `RESOURCE_NAME` `REGION` `RISK` `REMEDIATION_RECOMMENDATION_TEXT`
`COMPLIANCE`

구분자는 `;`. 필드에 긴 JSON이 들어가므로 파이썬에서
`csv.field_size_limit(sys.maxsize)` 필요.

## gitleaks (시크릿 / git 히스토리) ⚠️ 미검증

```bash
gitleaks detect --source . --report-path ~/isms/gitleaks-<repo>.json \
  --log-opts="--all"
```

`--log-opts="--all"`가 핵심. 현재 파일에 없어도 과거 커밋에 남은 키는 실제
결함이며 심사에서 자주 지적된다.

## Trivy (의존성 CVE + IaC + 컨테이너) ⚠️ 미검증

```bash
trivy repo . --scanners vuln,secret,misconfig \
  --format json -o ~/isms/trivy-<repo>.json
```

## Semgrep (SAST) ⚠️ 미검증

```bash
semgrep --config=p/owasp-top-ten --json -o ~/isms/semgrep-<repo>.json
```

## 인증기준 매핑 참고

| 도구 | 주요 ISMS-P 인증기준 |
| --- | --- |
| Prowler | 2.5 인증·권한, 2.6 접근통제, 2.7 암호화, 2.9 운영관리, 2.10 클라우드, 2.11 사고예방, 2.12 재해복구 |
| gitleaks | 2.5.1 인증정보, 2.7.1 암호화 정책 |
| Semgrep | 2.6 접근통제, 2.11.2 취약점 점검 |
| Trivy | 2.9.5 로그, 2.10.8 패치관리, 2.11.2 취약점 점검 |

Prowler 결과는 `compliance/` CSV에 이미 인증기준이 붙어 나오므로 재매핑
불필요. 나머지 도구는 위 표 기준으로 수동 매핑.

## 보완 — 상시 통제 증적

AWS Config **K-ISMS-P Operational Best Practices conformance pack** (AWS 공식).
Prowler가 시점 스냅샷이라면 이건 지속 모니터링이라, 심사에서 "지속적 통제"
증적으로 쓰인다. 심사 준비 기간이 길면 함께 켜둘 것.
