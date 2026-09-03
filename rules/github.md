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
   **괄호를 붙이지 않는다** — `docs(korean-style):` 같은 Conventional Commits 꼴은 금지.
   위 표에 있는 접두사 하나 + `:` 가 전부다.
4. commit 메시지의 단위는 작게 나눈다.
   - 여기서의 `작게` 는 파일 단위로 설정한다.
   - 여러 파일을 한 번에 하는 경우에는 수정된 부분에 있어서 관련된 부분을 묶어 함께 commit 한다.
5. commit 메시지는 **한글로** 작성한다.

**`type(scope):` 꼴은 되풀이해서 새어든다.** 표만 있고 금지가 없던 동안 실제로 반복됐고,
매번 나중에 고쳐졌다 — `docs(korean-style):` → `docs:`, `add(hooks):` → `add:`,
`docs(notion):` → `docs:`, `fix(orch):`, `rules(korean-style):`. 마지막 것은
`rules`가 표에 없는 접두사라 두 번째 위반이기도 하다.

**고친 기록이 남아도 다음 세션이 다시 쓴다.** Conventional Commits가 기본 습관이고,
활성 플러그인 `caveman:caveman-commit`이 `<type>(<scope>): <summary>`를 명문화해 두었기
때문이다. **이 파일이 그 스킬보다 우선한다.**

이 repo에는 `commit-msg` hook도 CI도 없어서 **기계로 잡히지 않는다.** 접두사 검사는
정규식 한 줄이면 되므로, 되풀이되면 hook을 붙인다.

**무인 실행(ralph loop)에서 4번을 읽는 법 — 커밋 단위는 plan의 `Task` 하나다.**
plan 파일 하나에 커밋이 여럿 나온다:

```
plan 파일 (docs/plans/<ID>-MMDD-plan-<topic>.md)
  Task 1  ->  커밋 1   (impl + test + 그 Task가 건드린 파일)
  Task 2  ->  커밋 2
  Task 3  ->  커밋 3
```

Task 아래로 파일별로 더 쪼개면 impl만 있고 test 없는 커밋, 또는 그 반대가 생겨 **테스트가
깨진 중간 커밋**이 남는다 — 규칙 4의 취지에 역행한다. Phase C 리뷰 세션의 "지적 하나당 커밋
하나"가 같은 규칙의 더 좁은 적용이다.

**`feature` vs `feat`.** 커밋 접두사는 위 표의 `feature`, 브랜치는 `feat/<NN>-<subject>`.
다른 자리라 충돌이 아니다. `dev-workflow` 스킬의 PR 제목 `[DEV-XXXX] type: 설명`에서
`type`은 **위 표의 접두사**를 쓴다.

## 브랜치 자르는 지점 — base와 다르다

**작업 브랜치를 자르는 지점과 PR base는 별개다.** 둘이 다른 것이 정상이고, 어느 쪽도
상대에서 유추하지 않는다.

| 축 | 정하는 것 |
| --- | --- |
| **자르는 지점** | 그 repo의 **기본 브랜치**(`main` 또는 `develop`). 아래 표 |
| **PR base** | 그 repo CLAUDE.md 관례. 열려 있는 배포 회차 브랜치가 있으면 그쪽일 수 있다 |

기본 브랜치는 repo마다 갈린다 — `~/plab/CLAUDE.md` 의 Repo Map 표에 repo별로 적혀 있다.
**추측하지 말고 확인한다:**

```bash
git -C <repo> symbolic-ref --short refs/remotes/origin/HEAD   # origin/main | origin/develop
```

### 임시 브랜치에서 자르지 않는다

배포 회차 브랜치(`release/YYMMDD-NN`)처럼 **머지 후 삭제되는 컷에서 브랜치를 뻗지 않는다.**
없어질 브랜치에 히스토리가 매달린다. PR base 로만 쓴다.

기본 브랜치가 회차 브랜치보다 앞서 있으면 PR diff 에 다른 PR 커밋이 딸려 보인다
(2026-09-03 `$PLAB_REPO_SERVER` 에서 4커밋 드리프트 발생). **그건 감수하고 base 쪽에서
정리한다 — drift 를 보고 브랜치를 회차에서 다시 자르지 말 것.** 그날 그렇게 잘못
결론냈고 사용자가 바로잡았다.

## Git Branch 전환 규칙

- `git checkout -- <file>` (파일 복원)은 항상 허용
- **브랜치 전환** (`git checkout <branch>`, `git switch <branch>`) 실행 전 반드시 AskUserQuestion으로 확인:
  - 선택지: "현재 repo에서 checkout" / "worktree 생성 (`superpowers:using-git-worktrees`)" / "취소"
  - 이유: 다른 Claude 세션이 같은 repo에서 작업 중일 수 있으며, checkout은 모든 세션에 영향을 줌
- 새 브랜치 생성만 필요한 경우: `git branch <name>` (checkout 없이) — 확인 불필요
