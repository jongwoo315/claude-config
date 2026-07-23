---
name: parse-slack
description: Use when starting a task from a Slack message URL - extracts message content, thread replies, and images for downstream processing
---

# Parse Slack Message

## Overview

Slack URL에서 메시지, 스레드 댓글, 첨부 이미지를 추출하여 `docs/plans/`에 저장합니다.

## When to Use

- Slack 메시지 URL을 받아서 작업을 시작할 때
- 이슈/버그 리포트가 Slack에 있을 때
- Slack 스레드의 전체 컨텍스트가 필요할 때

## Process

### 1. URL 파싱

Slack URL 형식: `https://{workspace}.slack.com/archives/{CHANNEL_ID}/p{TIMESTAMP}`

```bash
# URL에서 채널 ID와 타임스탬프 추출
SLACK_URL="$1"
CHANNEL_ID=$(echo "$SLACK_URL" | grep -oE 'archives/[^/]+' | cut -d'/' -f2)
RAW_TS=$(echo "$SLACK_URL" | grep -oE 'p[0-9]+' | sed 's/p//')
# 타임스탬프 변환: 1234567890123456 -> 1234567890.123456
MESSAGE_TS="${RAW_TS:0:10}.${RAW_TS:10}"
```

### 2. Slack API 호출

```bash
# 메시지 + 스레드 댓글 조회
# - xoxp 토큰은 Bearer 헤더 인증 실패 → form POST 필수
# - Content-Type 명시 필수: RTK proxy가 -d 파라미터의 $VARIABLE 확장을 망가뜨리는 이슈 방지
# - | jq 파이프로 RTK auto-skip 트리거
curl -s -X POST "https://slack.com/api/conversations.replies" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=$SLACK_TOKEN" \
  -d "channel=$CHANNEL_ID" \
  -d "ts=$MESSAGE_TS" \
  | jq '.'
```

**봇/알림 메시지 주의:** 알림 봇 메시지(Datadog, CloudWatch 등)는 `text`가 빈 문자열인 경우가 많음 — 실제 내용은 `attachments[]`(`.title`, `.text`, `.fallback`)와 `blocks[]`에 있음. `text`가 비어 있으면 반드시 fallback 추출:

```bash
# text 빈 메시지 → attachments/blocks에서 내용 추출
... | jq '.messages[0] | {user, bot_id, ts,
  attachments: [.attachments[]? | {title, text, fallback}],
  blocks: [.blocks[]? | .. | .text? // empty]}'
```

### 3. 결과 저장

결과를 `docs/plans/YYMMDD-<topic>-input.md`에 저장:

```markdown
# Slack Input - {날짜}

## 원본 메시지
**작성자:** {user}
**시간:** {timestamp}

{message text}

## 스레드 댓글
1. **{user1}** ({time}): {comment}
2. **{user2}** ({time}): {comment}

## 첨부 파일/이미지
- {file_name}: {url}

## 메타데이터
- **Channel:** {channel_name}
- **Message Link:** {original_url}
```

## Output

- 파일 경로: `docs/plans/YYMMDD-<topic>-input.md`
- `<topic>`은 메시지 내용에서 추출하거나 사용자에게 확인

## Next Step

파싱 완료 후 사용자에게 확인:
> "Slack 메시지를 파싱했습니다. 내용을 확인해주세요."

<!-- SYNC: parse/jira.md, parse/slack.md, parse/notion.md -->
그 후 워크플로우를 선택합니다:
> "어떤 워크플로우로 진행할까요?"
> 1. **dev-workflow** — 프로세스 중심 (계획 → 추적 → 실행 → 검증)
> 2. **debugging-workflow** — 버그/이슈 근본 원인 분석 후 수정 (systematic-debugging 포함)
> 3. **ralph-dev** — 자율 반복 (well-defined tasks, clear success criteria)
> 4. **직접 진행** — 워크플로우 없이 직접 작업
