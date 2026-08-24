#!/usr/bin/env python3
"""내 채팅 출력에서 한국어 산문만 뽑는다. 주간 sweep 잡이 읽는다.

transcript 에는 도구 호출·코드가 섞여 있고 용량이 크다(한 주 1MB 넘음).
조어는 설명하는 문장에서 나오므로 한글이 많은 메시지만 남기고 상한을 둔다.
"""
from __future__ import annotations
import argparse, json, pathlib, re, sys
from datetime import datetime, timedelta, timezone

HANGUL = re.compile(r"[가-힣]")
ROOT = pathlib.Path.home() / ".claude" / "projects"


def messages(days: int):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    for f in sorted(ROOT.glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
        if datetime.fromtimestamp(f.stat().st_mtime, timezone.utc) < cutoff:
            continue
        try:
            lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        for ln in lines:
            try:
                d = json.loads(ln)
            except ValueError:
                continue
            if d.get("type") != "assistant":
                continue
            ts = d.get("timestamp") or ""
            if ts:
                try:
                    if datetime.fromisoformat(ts.replace("Z", "+00:00")) < cutoff:
                        continue
                except ValueError:
                    pass
            blocks = d.get("message", {}).get("content", [])
            if not isinstance(blocks, list):
                continue
            text = "".join(
                b.get("text", "") for b in blocks
                if isinstance(b, dict) and b.get("type") == "text"
            )
            if text.strip():
                yield ts[:10], text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--min-hangul", type=int, default=200,
                    help="한글이 이보다 적은 메시지는 버린다 (산문이 아니다)")
    ap.add_argument("--max-bytes", type=int, default=60000)
    args = ap.parse_args()

    cand = [
        f"\n----- {day} -----\n{text.strip()}\n"
        for day, text in messages(args.days)
        if len(HANGUL.findall(text)) >= args.min_hangul
    ]

    # 상한에 걸리면 최근 것만 담긴다 — 하루치만 보게 된다.
    # 창 전체에 고르게 퍼뜨린 뒤 담는다.
    stride = 1
    while stride <= len(cand):
        picked = cand[::stride]
        if sum(len(c.encode("utf-8")) for c in picked) <= args.max_bytes:
            break
        stride += 1

    out, total = [], 0
    for chunk in picked if cand else []:
        size = len(chunk.encode("utf-8"))
        if total + size > args.max_bytes:
            break
        out.append(chunk)
        total += size

    sys.stdout.write("".join(out))
    print(f"\n----- 끝: 메시지 {len(out)}개 / {total:,}바이트 / 최근 {args.days}일 -----",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
