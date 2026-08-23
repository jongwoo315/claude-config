## Python Environment

**CRITICAL: Python 명령(`python`, `python3`, `pip`, `pip3`, `python -c` 등)을 실행하기 전에 반드시 아래 감지 절차를 먼저 수행할 것.**
**감지 절차 없이 Python 명령을 바로 실행하는 것은 금지.**
system Python (`/usr/bin/python3`) 사용 금지.

**적용 범위:** 단순 스크립트, 패키지 설치(`pip install`), 모듈 확인(`python3 -c "import ..."`) 등 모든 상황 포함. 예외 없음.

**감지 절차 (Python 명령 실행 전 필수):**

1. 프로젝트 디렉토리에서 `venv/`, `.venv/`, `env/` 존재 여부 확인
   - 존재하면 → `source .venv/bin/activate && python ...` 형태로 실행
2. `.python-version` 파일 존재 여부 확인
   - 존재하면 → pyenv가 자동 처리 (별도 활성화 불필요, `which python`으로 확인만)
3. 둘 다 없으면 → 사용자에게 확인

```bash
# WRONG — 감지 절차 없이 바로 실행 (금지)
python -c "from match.models import Match; ..."

# CORRECT — 먼저 환경 확인 후 실행
# NOTE: ls -d는 RTK가 경로명을 삭제하므로 find 사용
find . -maxdepth 1 \( -name "venv" -o -name ".venv" -o -name "env" -o -name ".python-version" \) | cat
which python && python --version  # 인터프리터 확인
# pyenv 환경이면 ~/.pyenv/shims/python 이어야 함
# /usr/bin/python3 이면 잘못된 것 → venv 활성화 필요
```

### Worktree에서의 Python 환경

| 방식  | 감지 파일           | worktree 조치                   |
| ----- | ------------------- | ------------------------------- |
| venv  | 메인 repo에 `venv/` | `ln -s <main-repo>/venv ./venv` |
| pyenv | `.python-version`   | 없음 (git tracked, 자동 존재)   |
