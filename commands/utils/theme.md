---
name: theme
description: 아티팩트·슬라이드·문서·HTML을 만들 때 테마(색 팔레트 + 폰트)를 입힌다. 사용자가 "테마는 <이름>으로", "ocean-depths로 만들어" 처럼 테마를 지정하거나 "테마 뭐 있어"라고 물으면 아티팩트를 쓰기 전에 이 파일을 읽는다. 테마 이름 — ocean-depths, sunset-boulevard, forest-canopy, modern-minimalist, golden-hour, arctic-frost, desert-rose, tech-innovation, botanical-garden, midnight-galaxy. 없는 톤은 즉석에서 새로 만든다.
---

# Theme Factory

앤트로픽 공식 `theme-factory`(Apache-2.0)를 커맨드로 옮긴 것. 에셋은 `~/.claude/themes/` —
테마 10개(`<이름>.md`), `theme-showcase.pdf`, `LICENSE.txt`.

## 기본 경로 — 이름이 이미 주어졌다

거의 항상 이쪽이다. *"작업한 거 아티팩트로 만들어. 테마는 ocean-depths."*

`~/.claude/themes/<이름>.md`를 읽고 그 색·폰트를 산출물 전체에 적용한다. **되묻지 않는다.**
쇼케이스를 띄우지 않는다. 이름이 오타거나 없는 것이면 가까운 후보를 대고 한 번만 확인한다.

## 이름을 모를 때만 — 쇼케이스

*"테마 뭐 있어?"* / *"골라줘"* 일 때만:

1. `~/.claude/themes/theme-showcase.pdf`를 보여준다. 보기용이므로 **고치지 말 것.**
2. 고를 때까지 기다린다. 대신 고르지 않는다.

아래 표로 대신할 수도 있다 — PDF는 실제 렌더링을 눈으로 볼 때만 필요하다.

| 이름 | 성격 | 어울리는 곳 |
| --- | --- | --- |
| `ocean-depths` | 차분한 해양, 남색+틸 | 기업 발표, 재무 리포트, 컨설팅 |
| `sunset-boulevard` | 따뜻하고 선명한 노을 | 크리에이티브 피치, 마케팅, 라이프스타일 |
| `forest-canopy` | 흙빛 자연 | 환경·지속가능성 리포트, 아웃도어, 웰니스 |
| `modern-minimalist` | 무채색 미니멀 | 기술 발표, 건축 포트폴리오, 데이터 시각화 |
| `golden-hour` | 가을빛 따뜻함 | 요식·호스피탈리티, 가을 캠페인, 공예 |
| `arctic-frost` | 서늘하고 맑은 겨울 | 헬스케어, 클린테크, 제약 |
| `desert-rose` | 부드러운 흙빛 로즈 | 패션, 뷰티, 웨딩, 인테리어 |
| `tech-innovation` | 대담한 테크 | 스타트업, 소프트웨어 런칭, AI/ML |
| `botanical-garden` | 싱그러운 초록 | 식음료, 농산물, 식물 브랜드 |
| `midnight-galaxy` | 극적인 심야·우주 | 엔터테인먼트, 게이밍, 럭셔리, 크리에이티브 |

## 없는 톤이면 새로 만든다

위 파일들과 같은 형식(색 팔레트 + 폰트 페어링 + 어울리는 곳)으로 짜고, 조합이 무엇을
뜻하는지 드러나는 이름을 붙인다. 먼저 보여 확인받고 적용한다. 재사용할 것이면
`~/.claude/themes/<이름>.md`로 저장한다.

## 아티팩트에 적용할 때 — 폰트를 그대로 쓰면 안 된다

테마 파일의 폰트는 `DejaVu Sans` 계열이라 **Google Fonts에 없다.** 아티팩트는 CSP상
Google Fonts(`fonts.googleapis.com`/`fonts.gstatic.com`)만 외부 로드가 되므로 그대로 쓰면
조용히 폴백된다. 성격(휴머니스트 산세리프, 지오메트릭 등)이 맞는 Google Fonts로 치환하고
실제 동작하는 폴백 스택을 붙인다.

색은 그대로 쓰되 **라이트/다크 양쪽에서 대비를 확인한다.** 아티팩트는 뷰어의 테마로
렌더되므로 한쪽만 맞추면 다른 쪽이 깨진다. 테마의 배경색을 `body`에 명시적으로 넣는다 —
투명하면 뷰어 테마 색이 비친다.

**`artifact-design` 로드는 그대로 필수다.** 이 파일은 그 위에 팔레트를 얹는 것이지
대체재가 아니다. 차트를 그린다면 `dataviz`가 우선한다 — 검증된 팔레트와 검증기가 거기 있다.

## 출처

https://github.com/anthropics/skills/tree/main/skills/theme-factory (Apache-2.0).
라이선스 전문은 `~/.claude/themes/LICENSE.txt`.
