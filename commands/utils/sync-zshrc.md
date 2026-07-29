# Sync .zshrc and .zshenv to Notion

Upload password-protected zips of `~/.zshrc` and `~/.zshenv` to Notion as separate files.

## Target

- **Page:** iTerm2
- **URL:** https://www.notion.so/jongwoo315/iTerm2-ab4c5445dede4062ab1fcb0a98e6ece0
- **Sections:** zshrc (heading_3), zshenv (heading_3)

## Usage

Run `/sync-zshrc` to create encrypted zips and upload to Notion.

## 비밀번호 처리 — 이 절차의 핵심 제약

**Claude는 zip 비밀번호를 받지 않는다.** AskUserQuestion으로 받아 `-P "<password>"`로
명령줄에 넣는 방식은 쓰지 않는다. 이유:

- 비밀번호가 대화 기록·셸 히스토리·프로세스 목록(`ps`)에 평문으로 남는다
- `~/.zshenv`에는 프로덕션 DB 비밀번호와 API 토큰 20여 개가 들어 있다.
  zip 비밀번호는 그 전부를 감싸는 마지막 방어선이라 노출되면 암호화 자체가 무의미해진다
- Claude는 평문 비밀번호를 다루지 않는다. 사용자가 허용해도 동일하다

**대신 `zip -e`가 직접 대화형으로 묻게 한다.** 입력이 화면에 찍히지 않고 어디에도 안 남는다.
Bash 도구는 대화형 stdin을 지원하지 않으므로 그 한 줄만 사용자가 실행한다.
결과물은 동일하다 — 같은 ZipCrypto, 같은 파일명, 같은 경로.

## Process

**Step 1 — Claude가 실행:** 파일 준비 + Finder/Notion 열기

```bash
rm -f /tmp/zshrc.zip /tmp/zshenv.zip /tmp/zshrc /tmp/zshenv

cp ~/.zshrc  /tmp/zshrc
cp ~/.zshenv /tmp/zshenv
chmod 600 /tmp/zshrc /tmp/zshenv     # zip 만들기 전까지 평문이 /tmp에 있다

open /tmp/
sleep 0.5
open "notion://www.notion.so/jongwoo315/iTerm2-ab4c5445dede4062ab1fcb0a98e6ece0"
```

**Step 2 — 사용자가 실행:** 아래를 그대로 제시하고, 프롬프트에 `!` 접두사로 붙여넣게 한다.

```
! cd /tmp && zip -e zshrc.zip zshrc && zip -e zshenv.zip zshenv && rm -f zshrc zshenv && ls -lh /tmp/*.zip
```

`zip -e`가 비밀번호를 두 번(입력·확인) 묻는다. 두 파일에 같은 비밀번호를 쓴다.
`rm -f zshrc zshenv`가 평문 사본을 지운다 — 이 부분을 빠뜨리지 말 것.

**Step 3 — 사용자가 수동:** Finder에서 Notion으로 드래그

- `zshrc.zip` → **zshrc** 섹션
- `zshenv.zip` → **zshenv** 섹션

## Output

1. `/tmp/zshrc.zip`, `/tmp/zshenv.zip` (비밀번호 보호)
2. `/tmp` 평문 사본 제거됨
3. Finder + Notion 페이지 열림
4. 사용자가 각 zip을 해당 섹션으로 드래그

## Notes

- 암호화는 표준 `zip -e` = **ZipCrypto**. 알려진 평문 공격에 취약하다.
  `export NOTION_API_KEY=` 같은 예측 가능한 문자열이 안에 있어 특히 그렇다.
  Notion 계정이 안전한 한 실질 위험은 낮지만, 강화하려면 AES로 바꾼다:
  `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in zshenv -out zshenv.enc`
  (복호화: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in zshenv.enc -out zshenv`)
- Notion의 기존 zshrc 파일 블록(`2fc41e61-65c0-80ed-aa8f-cb6b3f7051d1`)은 "zshrc" heading 아래에 있다
- zshenv heading_3 섹션이 없으면 새로 만들어야 한다
- Notion API는 파일 업로드를 지원하지 않아 드래그 앤 드롭이 필수다
