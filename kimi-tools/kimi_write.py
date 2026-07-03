#!/usr/bin/env python3
"""
kimi-write: Generate boilerplate (tests, configs, docs) using Kimi via OpenCode.

OpenCode runs as an agent and writes files directly to disk.

Usage:
  kimi_write.py "write pytest tests for the auth module" --ref src/auth.py --out tests/test_auth.py
  kimi_write.py --spec "generate Dockerfile" --context manage.py --target Dockerfile

Requires: opencode CLI installed and configured with Kimi
"""
import sys
import os
import argparse
import subprocess
import tempfile
from pathlib import Path

DEFAULT_MODEL = os.getenv("KIMI_MODEL", "opencode-go/kimi-k2.6")


def main():
    parser = argparse.ArgumentParser(description="Generate boilerplate with Kimi")
    parser.add_argument("spec_positional", nargs="?", help="What to generate (positional form)")
    parser.add_argument("--spec", help="What to generate (named form)")
    parser.add_argument("--ref", "--context", action="append", default=[], metavar="FILE",
                        dest="ref", help="Reference file(s) to include as context (repeatable)")
    parser.add_argument("--out", "--target", metavar="FILE",
                        dest="out", help="Write output to this file (default: stdout)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    spec = args.spec or args.spec_positional
    if not spec:
        sys.exit("Error: provide a spec (what to generate)")

    # Determine output path — use abs path so opencode writes to the right place
    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        message = f"{spec}\n\nWrite the result to: {out_path}\nDo not create any other files."
        print(f"Generating → {out_path} ...", file=sys.stderr)
    else:
        tmp = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
        tmp.close()
        out_path = Path(tmp.name)
        message = f"{spec}\n\nWrite the result to: {out_path}\nOutput only the requested content, no explanation."
        print("Generating → stdout ...", file=sys.stderr)

    cmd = ["opencode", "run", "-m", args.model, message]
    for ref in args.ref:
        if not Path(ref).exists():
            print(f"Warning: {ref} not found, skipping", file=sys.stderr)
            continue
        cmd += ["-f", str(Path(ref).resolve())]

    result = subprocess.run(cmd, text=True, capture_output=True, timeout=120)

    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(1)

    if not args.out:
        content = out_path.read_text() if out_path.exists() else ""
        os.unlink(out_path)
        print(content.strip())
    else:
        print(f"Written to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
