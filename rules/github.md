## GitHub

**계정 전환 규칙 (모든 GitHub 작업 전 필수 확인):**

| 디렉토리   | GitHub 계정  | 용도               |
| ---------- | ------------ | ------------------ |
| `~/prv/*`   | `jongwoo315` | 개인 프로젝트                       |
| `~/.claude` | `jongwoo315` | claude-config repo (예외 — "그 외" 아님) |
| `~/work/*`  | `kimwoz`     | $PLAB_GH_ORG 업무                 |
| `~/plab/*`  | `kimwoz`     | $PLAB_GH_ORG 업무 (`~/plab/.wt/*` worktree 주차장 포함 — 자동 kimwoz) |
| 그 외       | `kimwoz`     | 기본값                             |

GitHub API 호출, git push, PR 생성/코멘트 등 **모든 GitHub 작업 전에** 현재 계정을 확인하고 필요시 전환:

```bash
CURRENT_GH_USER=$(gh api user -q '.login' 2>/dev/null)
# ~/prv/ 또는 ~/.claude → jongwoo315, 그 외 → kimwoz
```

**Git commit email 규칙 (새 레포 clone/init 시 필수):**

| 디렉토리               | `user.email` (로컬 설정)                       |
| ---------------------- | ---------------------------------------------- |
| `~/prv/*`              | `jongwoo315@gmail.com`                         |
| `~/work/*`, `~/plab/*` | `$PLAB_WORK_EMAIL` (글로벌 기본값) |

`~/prv/` 레포에서 첫 커밋 전 반드시: `git config user.email "jongwoo315@gmail.com"`

**PR 머지 보호 규칙:**

- `production` 또는 `main` 브랜치로 머지할 때는 **반드시 사용자 확인(선택지 제시)** 후 진행할 것
- release/feature 브랜치로의 머지는 확인 없이 진행 가능
- "merge PRs and create release PR" = release 브랜치에 머지하라는 뜻이지, production에 직접 머지하라는 뜻이 아님

## Commit 메시지 규칙

1. 아래 접두사로 시작한다.

   | 접두사 | 용도 |
   | --- | --- |
   | `init` | 프로젝트 초기 설정 관련 변경 |
   | `feature` | 새로운 기능 추가 |
   | `add` | 새로운 파일 또는 설정 추가 |
   | `fix` | 버그 수정, 간단한 코드 수정 |
   | `docs` | 문서 수정 |
   | `refactor` | 코드 리팩토링 |
   | `test` | 테스트 코드, 리팩토링 테스트 코드 추가 |
   | `chore` | 빌드 업무 수정, 패키지 매니저 수정 등의 변경, 단순 오타 수정 |
   | `delete` | 필요하지 않은 모듈 삭제, 코드 삭제 등 |

2. 접두사는 **소문자로 작성**한다.
3. 접두사 뒤에 `:` 를 붙이고 **띄어쓰기를 포함**한다.
4. commit 메시지의 단위는 작게 나눈다.
   - 여기서의 `작게` 는 파일 단위로 설정한다.
   - 여러 파일을 한 번에 하는 경우에는 수정된 부분에 있어서 관련된 부분을 묶어 함께 commit 한다.
5. commit 메시지는 **한글로** 작성한다.

**무인 실행(ralph loop)에서 4번을 읽는 법.** plan 한 단계를 TDD로 끝낸 것이 한 커밋이다 —
impl + test + 그 단계가 건드린 파일이 함께 간다. 한 단계에서 나온 변경을 파일별로 쪼개면
테스트가 깨진 중간 커밋이 생겨 오히려 규칙 4의 취지에 어긋난다. **단계가 여럿이면 커밋도
여럿이다.** Phase C 리뷰 세션의 "지적 하나당 커밋 하나"가 같은 규칙의 더 좁은 적용이다.

**`feature` vs `feat`.** 커밋 접두사는 위 표의 `feature`, 브랜치는 `feat/<NN>-<subject>`.
다른 자리라 충돌이 아니다. `dev-workflow` 스킬의 PR 제목 `[DEV-XXXX] type: 설명`에서
`type`은 **위 표의 접두사**를 쓴다.

## Git Branch 전환 규칙

- `git checkout -- <file>` (파일 복원)은 항상 허용
- **브랜치 전환** (`git checkout <branch>`, `git switch <branch>`) 실행 전 반드시 AskUserQuestion으로 확인:
  - 선택지: "현재 repo에서 checkout" / "worktree 생성 (`superpowers:using-git-worktrees`)" / "취소"
  - 이유: 다른 Claude 세션이 같은 repo에서 작업 중일 수 있으며, checkout은 모든 세션에 영향을 줌
- 새 브랜치 생성만 필요한 경우: `git branch <name>` (checkout 없이) — 확인 불필요
