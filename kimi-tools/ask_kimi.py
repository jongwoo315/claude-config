#!/usr/bin/env python3
"""
ask-kimi: Read files and answer questions using Kimi K2 via OpenCode.

Usage:
  ask_kimi.py file1.py file2.py "what does this do?"
  ask_kimi.py --paths file1.py file2.py --question "what does this do?"

Requires: opencode CLI installed and configured with Kimi
"""
import sys
import os
import argparse
import glob as glob_module
import subprocess
from pathlib import Path

DEFAULT_MODEL = os.getenv("KIMI_MODEL", "opencode-go/kimi-k2.6")


def main():
    parser = argparse.ArgumentParser(description="Ask Kimi questions about files")
    parser.add_argument("inputs", nargs="*", help="files followed by question (last positional arg)")
    parser.add_argument("--paths", nargs="+", metavar="FILE", help="file paths (named form)")
    parser.add_argument("--question", "-q", help="question to ask (named form)")
    parser.add_argument("--glob", help="glob pattern to expand directories")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    if args.paths and args.question:
        file_args = args.paths
        question = args.question
    elif args.inputs:
        *file_args, question = args.inputs
    else:
        sys.exit("Error: provide files and a question")

    # Expand globs / dirs
    resolved = []
    for arg in file_args:
        p = Path(arg)
        if p.is_dir():
            pattern = args.glob or "**/*"
            resolved += [str(f) for f in p.glob(pattern) if f.is_file()]
        elif "*" in arg or "?" in arg:
            resolved += glob_module.glob(arg, recursive=True)
        else:
            resolved.append(arg)

    if not resolved:
        sys.exit("Error: no files found")

    print(f"Reading {len(resolved)} file(s)...", file=sys.stderr)

    # Build command: message first, then -f flags for each file
    cmd = ["opencode", "run", "-m", args.model, question]
    for path in resolved:
        cmd += ["-f", path]

    result = subprocess.run(cmd, text=True, capture_output=True)
    print(result.stdout.strip())
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)


if __name__ == "__main__":
    main()
