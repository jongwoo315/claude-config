---
name: _why-cards-common
description: Universal rules for all *-why-cards decks. NOT a runnable command. INCLUDE-ONLY — each deck file references this first, then adds deck-specific rules.
---

# Why-Cards Common Spec (SSOT)

**Status:** include-only. NOT invoked directly. Each `<deck>-why-cards.md` MUST start with the include line and inherit every rule below. Deck-specific overrides allowed only where this file marks `<DECK_SLOT>`.

## Include Contract

Every `<deck>-why-cards.md` file MUST start (after frontmatter) with:

> Follow `~/.claude/commands/learn/_why-cards-common.md` first. Deck-specific overrides below.

Reader (CLI Claude Code session OR Hermes dojo Telegram bot) loads this common file before deck file. Rules in this file are canonical; deck file rules only fill `<DECK_SLOT>` placeholders or add domain-specific scenario guidance.

---

## 1. Grade Token Format (HARD RULE)

First line of every grading reply MUST be exactly one of:

- `✅ 정답`
- `🟡 반반`
- `❌ 틀림`

No preamble, no markdown wrapping, no AskUserQuestion. Discard and rewrite if first line doesn't match.

## 2. 5-Step Session Flow

```
Step 1: Progress Header   → one-liner, skip if shown == 0
Step 2: Why Story         → mobile-readable, no answer reveal
Step 3: What Breaks?      → fresh scenario, not hardcoded
Step 4: Grade & Explain   → grade token → brief explain → code snippet
Step 5: Record Prompt     → record/skip → on record: update JSON → output stop line
```

### Step 1: Progress Header

```
📊 [topic] — shown: N회, 정답률: X% (✅Y 🟡W ❌Z)
```

Emoji order normalized: `✅Y 🟡W ❌Z` for all decks.
Skip header entirely if `shown == 0`.

### Step 2: Why Story

Send Why Story block only from `<CONTENT_PATH>`. Mobile-readable, ≤ ~30 lines. Strip long code blocks to plain text if needed. Do NOT reveal answer.

### Step 3: What Breaks? (Generated Scenario)

Generate FRESH scenario each session. Do NOT reuse hardcoded scenario from cards file.

- New situation: different system name, different bug pattern, different real-world context
- Stay grounded in same core concept from Why Story
- Concrete: broken prompt or code snippet + ask what goes wrong
- Difficulty tier (by `shown`):
  - tier 0 (shown == 0): friendly, single concept, no chaining
  - tier 1 (shown 1–2): variant — different domain / bug pattern, core concept identical
  - tier 2 (shown 3–5): edge case or combine with another concept
  - tier 3 (shown ≥ 6): adversarial — looks-right-but-wrong trap or production failure
- Miss-focused override: `half > 0` OR `wrong > 0` → target previously-missed angle
- Mastery bump: `correct/(correct+wrong+half) >= 0.8` AND `shown >= 3` → tier +1

Ask JW to think — do NOT give answer yet.

> Full-card request (story + answer together) → send Why Story + hardcoded answer from cards file + generated scenario with its answer.

### Step 4: Grade & Explain

After JW answers → send plain text message with:

1. Grade token on first line (see §1)
2. Brief explanation of correct answer (no "한 줄 정리", no interview-rewrite)
3. Short real code example (5–15 lines, `<LANGUAGE_SLOT>`) showing concept in action. For `❌ 틀림` / `🟡 반반`, snippet must focus on the part JW missed.

**Do NOT call AskUserQuestion here.** Never embed grade inside button options. Never defer grading to follow-up message. Step 5 comes AFTER this message is sent.

**Self-rating emoji ban:** Do NOT append `😰 까먹음 / 🤔 어려움 / 😊 기억남 / 🔥 완벽` — those belong to spaced-review / daily-quest / prod-web-app only. Why-card uses `record / skip` (see Step 5).

### Step 5: Record Prompt + Save

Send plain text follow-up:

```
기록할까요? ✅ 기록 (<grade>) / ⏭️ 건너뛰기
```

`<grade>` matches Step 4's actual token. AskUserQuestion forbidden (Telegram unsupported).

On `record` → update JSON via Bash (Write/Edit blocked on `.claude/` paths):

```bash
python3 -c "
import json, os
p = os.path.expanduser('~/.claude/command-scripts/why-cards-progress.json')
all_d = json.load(open(p)) if os.path.exists(p) else {}
d = all_d.setdefault('<DECK_NAMESPACE>', {})
t = d.setdefault('<topic_id>', {'shown': 0, 'correct': 0, 'wrong': 0, 'half': 0, 'last_seen': ''})
t['shown'] += 1
t['<correct|wrong|half>'] += 1
t['last_seen'] = '<YYYY-MM-DD>'
json.dump(all_d, open(p, 'w'), indent=2, ensure_ascii=False)
"
```

After save → output ONLY:

```
✓ 기록 완료 — <DECK_NAMESPACE>/<topic_id>
```

Then STOP. No dashboard, no follow-up.

On `skip` → short ack, stop.

## 3. Progress Table (No-Topic Entry)

When deck invoked without topic, send plain text message with progress table:

```
<DECK_TITLE> 진도

| 토픽 | 횟수 | 정답률 | 마지막 |
|------|------|--------|--------|
| ... | ...회 | 🟡/✅ X% | M/DD |
```

Rules:

- **Enumerate ALL topics from `<CONTENT_PATH>` `##` headers in order** — NOT JSON keys. Topics missing from JSON = 미학습.
- 횟수: shown count (0회 if 미학습)
- 정답률: `correct ÷ (correct+wrong+half) × 100`. `🟡` if <80%, `✅` if 100%, `-` if 미학습
- 마지막: last_seen in `M/DD`, `-` if 미학습
- Order: content file section order (see deck file's `<TOPIC_ORDER>`)
- Footer: `약한 것: [topic1] / [topic2] ... (모두 X%)`

After table → send numbered text list (NEVER AskUserQuestion). Format: `1. topic (미학습)` / `2. topic 🟡 X%`. Ask: `번호나 토픽명 보내주세요.`

## 4. Trigger Alias Routing

Each deck has its own alias table (see `<TRIGGER_ALIASES>` in deck file). Accept:

- Bare topic ID (`react-loop`)
- Alias variant (`loop`, `리액트루프`)
- Number from progress-table list (`1`, `2`)

## 5. Telegram-Safety

- Use `||` pipe rows for compact tables (not fenced code blocks for progress)
- Separator row uses `=` sized to header text length + 2
- Header row format: `|| **토픽** | 횟수 | 정답률 | 마지막 |`
- No markdown table delimiters (`|---|---|`)
- No fenced code blocks for progress dashboard output
- Numbered topic list in plain text
- AskUserQuestion forbidden — Telegram has no native support

## 6. Deck-Specific Slots

Each deck file fills:

| Slot | Example |
|------|---------|
| `<DECK_NAMESPACE>` | `prompt`, `agent`, `rag`, `react`, `spring`, ... |
| `<DECK_TITLE>` | `Prompt Why Cards`, `RAG Why Cards`, ... |
| `<CONTENT_PATH>` | `~/.claude/command-scripts/learn/<deck>-why-cards.md` |
| `<LANGUAGE_SLOT>` | `Python/OpenAI SDK/LangChain`, `TypeScript/React`, `Java/Spring Boot`, ... |
| `<TRIGGER_ALIASES>` | Per-deck alias → topic-id table |
| `<TOPIC_ORDER>` | Ordered topic-id list matching content file section order |
| `<DOMAIN_SCENARIO_HINTS>` | Per-deck "What Breaks?" generation guidance (e.g. Airflow uses pipeline names; Spring uses class hierarchies) |
| Framework version notes | Optional — Airflow 2.x, FastAPI 0.100+, Spring 3.x |

## 7. Pedagogy Constants (Shared)

- Mobile-optimized response length
- Why-first — answer revealed only after JW thinks
- Fresh scenario every session — prevent card memorization
- AI/Backend engineer interview coverage standard
