## GitHub

**계정 전환 규칙 (모든 GitHub 작업 전 필수 확인):**

| 디렉토리   | GitHub 계정  | 용도               |
| ---------- | ------------ | ------------------ |
| `~/prv/*`  | `jongwoo315` | 개인 프로젝트      |
| `~/work/*` | `kimwoz`     | myplaycompany 업무 |
| `~/plab/*` | `kimwoz`     | myplaycompany 업무 |
| 그 외      | `kimwoz`     | 기본값             |

GitHub API 호출, git push, PR 생성/코멘트 등 **모든 GitHub 작업 전에** 현재 계정을 확인하고 필요시 전환:

```bash
CURRENT_GH_USER=$(gh api user -q '.login' 2>/dev/null)
# ~/prv/ → jongwoo315, 그 외 → kimwoz
```

**Git commit email 규칙 (새 레포 clone/init 시 필수):**

| 디렉토리               | `user.email` (로컬 설정)                       |
| ---------------------- | ---------------------------------------------- |
| `~/prv/*`              | `jongwoo315@gmail.com`                         |
| `~/work/*`, `~/plab/*` | `jongwoo.kim@plabfootball.com` (글로벌 기본값) |

`~/prv/` 레포에서 첫 커밋 전 반드시: `git config user.email "jongwoo315@gmail.com"`

**PR 머지 보호 규칙:**

- `production` 또는 `main` 브랜치로 머지할 때는 **반드시 사용자 확인(선택지 제시)** 후 진행할 것
- release/feature 브랜치로의 머지는 확인 없이 진행 가능
- "merge PRs and create release PR" = release 브랜치에 머지하라는 뜻이지, production에 직접 머지하라는 뜻이 아님

## Git Branch 전환 규칙

- `git checkout -- <file>` (파일 복원)은 항상 허용
- **브랜치 전환** (`git checkout <branch>`, `git switch <branch>`) 실행 전 반드시 AskUserQuestion으로 확인:
  - 선택지: "현재 repo에서 checkout" / "worktree 생성 (`superpowers:using-git-worktrees`)" / "취소"
  - 이유: 다른 Claude 세션이 같은 repo에서 작업 중일 수 있으며, checkout은 모든 세션에 영향을 줌
- 새 브랜치 생성만 필요한 경우: `git branch <name>` (checkout 없이) — 확인 불필요
