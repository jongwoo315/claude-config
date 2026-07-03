#!/usr/bin/env python3
"""
extract-chat: Strip Claude Code JSONL session files to clean conversation text.
Useful for piping sessions into Kimi for summarization or documentation.

Usage:
  extract_chat.py                        # latest session in current project
  extract_chat.py --list                 # list sessions for current project
  extract_chat.py <session.jsonl>        # specific file
  extract_chat.py --session <uuid>       # by session UUID
  extract_chat.py --project /path/to/project
  extract_chat.py | kimi_write.py "summarize this session as a changelog"

Output: plain text, one turn per block, tool calls stripped.
"""
import sys
import os
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone


CLAUDE_DIR = Path.home() / ".claude" / "projects"
SKIP_PREFIXES = ("<local-command", "<command-name", "<command-message", "<local-command-stdout")


def project_slug(path: Path) -> str:
    return str(path.resolve()).replace("/", "-")


def find_project_dir(project_path: Path) -> Path:
    slug = project_slug(project_path)
    return CLAUDE_DIR / slug


def list_sessions(project_dir: Path) -> list[Path]:
    return sorted(project_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)


def is_system_noise(text: str) -> bool:
    stripped = text.strip()
    return any(stripped.startswith(p) for p in SKIP_PREFIXES) or not stripped


def extract_text_from_content(content) -> str | None:
    if isinstance(content, str):
        return None if is_system_noise(content) else content.strip()

    if isinstance(content, list):
        parts = []
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "text":
                text = block.get("text", "").strip()
                if not is_system_noise(text):
                    parts.append(text)
            # skip: tool_use, tool_result, thinking, image
        return "\n".join(parts) if parts else None

    return None


def format_timestamp(ts: str | None) -> str:
    if not ts:
        return ""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return f" [{dt.astimezone().strftime('%H:%M')}]"
    except Exception:
        return ""


def extract_session(jsonl_path: Path) -> list[dict]:
    turns = []
    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            msg_type = obj.get("type")
            if msg_type not in ("user", "assistant"):
                continue

            message = obj.get("message", {})
            role = message.get("role", msg_type)
            content = message.get("content", "")
            text = extract_text_from_content(content)
            if text:
                turns.append({"role": role, "text": text, "ts": obj.get("timestamp")})

    return turns


def render(turns: list[dict]) -> str:
    lines = []
    for turn in turns:
        label = "You" if turn["role"] == "user" else "Claude"
        ts = format_timestamp(turn.get("ts"))
        lines.append(f"[{label}{ts}]")
        lines.append(turn["text"])
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Extract clean chat from Claude Code sessions")
    parser.add_argument("file", nargs="?", help="JSONL session file")
    parser.add_argument("--list", action="store_true", help="List available sessions")
    parser.add_argument("--session", help="Session UUID")
    parser.add_argument("--project", help="Project directory (default: cwd)")
    parser.add_argument("--all-projects", action="store_true", help="List sessions across all projects")
    parser.add_argument("-o", "--output", metavar="FILE", help="Write output to file (default: stdout)")
    args = parser.parse_args()

    if args.all_projects:
        for proj_dir in sorted(CLAUDE_DIR.iterdir()):
            sessions = list_sessions(proj_dir)
            if sessions:
                print(f"\n{proj_dir.name} ({len(sessions)} sessions)")
                for s in sessions[:3]:
                    mtime = datetime.fromtimestamp(s.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
                    print(f"  {s.stem}  {mtime}")
        return

    project_path = Path(args.project) if args.project else Path.cwd()
    project_dir = find_project_dir(project_path)

    if not project_dir.exists():
        sys.exit(f"No Claude sessions found for {project_path}\n(looked in {project_dir})")

    sessions = list_sessions(project_dir)
    if not sessions:
        sys.exit(f"No .jsonl session files in {project_dir}")

    if args.list:
        print(f"Sessions for {project_path} ({len(sessions)} total):\n")
        for i, s in enumerate(sessions):
            mtime = datetime.fromtimestamp(s.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
            size = s.stat().st_size
            marker = " ← latest" if i == 0 else ""
            print(f"  {s.stem}  {mtime}  {size//1024}KB{marker}")
        return

    if args.file:
        target = Path(args.file)
    elif args.session:
        matches = [s for s in sessions if s.stem == args.session]
        if not matches:
            sys.exit(f"Session {args.session} not found")
        target = matches[0]
    else:
        target = sessions[0]  # latest

    print(f"# Session: {target.stem}", file=sys.stderr)
    turns = extract_session(target)
    output = render(turns)

    if args.output:
        Path(args.output).write_text(output)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
