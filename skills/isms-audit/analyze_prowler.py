#!/usr/bin/env python3
"""Prowler CSV 요약기.

거대한 findings CSV(실측 수백 MB)를 컨텍스트에 안전한 크기의 JSON으로 접는다.
Read 도구로 원본 CSV를 여는 것 대신 이걸 쓴다.

핵심은 세 가지 접기:
  1. findings → 고유 CHECK_ID  (findings 수는 문제 수가 아니다)
  2. findings → RESOURCE_UID   (근본 원인 1개가 수십 건을 만든다)
  3. severity / service 분포

사용:
    python3 analyze_prowler.py <prowler-output.csv> [-o out.json]

전용 venv 파이썬으로 실행할 것:
    ~/isms/.venv/bin/python analyze_prowler.py ...
"""

import argparse
import collections
import csv
import json
import sys

SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}

# 정규식 기반이라 오탐이 잦은 체크. 리포트에 반드시 "검증 필요"로 표시한다.
FALSE_POSITIVE_PRONE = ("no_secrets_in_code", "no_secrets_in_variables", "_secrets_")


def load_failures(path):
    csv.field_size_limit(sys.maxsize)
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if row.get("STATUS") == "FAIL":
                yield row


def summarize(path, top_n=40):
    rows = list(load_failures(path))

    checks = collections.defaultdict(
        lambda: {"n": 0, "sev": "", "title": "", "svc": "", "resources": []}
    )
    resources = collections.Counter()
    for r in rows:
        c = checks[r["CHECK_ID"]]
        c["n"] += 1
        c["sev"] = r["SEVERITY"]
        c["title"] = r["CHECK_TITLE"]
        c["svc"] = r["SERVICE_NAME"]
        if len(c["resources"]) < 10:
            c["resources"].append(r["RESOURCE_UID"])
        resources[r["RESOURCE_UID"]] += 1

    ranked = sorted(
        ({"id": k, **v} for k, v in checks.items()),
        key=lambda x: (SEV_ORDER.get(x["sev"], 9), -x["n"]),
    )

    flagged = [c["id"] for c in ranked if any(p in c["id"] for p in FALSE_POSITIVE_PRONE)]

    return {
        "_warning": (
            "total_fail은 리소스별 발생 건수다. 문제 수가 아니다. "
            "unique_checks와 top_resources(근본 원인)로 우선순위를 매길 것. "
            "인증기준 섹션별 FAIL은 한 findings가 여러 기준에 매핑되므로 합산 금지."
        ),
        "total_fail": len(rows),
        "unique_checks": len(checks),
        "severity": dict(collections.Counter(r["SEVERITY"] for r in rows)),
        "top_services": collections.Counter(r["SERVICE_NAME"] for r in rows).most_common(15),
        # 근본 원인 후보: 한 리소스가 다수 findings를 만든 경우
        "top_resources": resources.most_common(20),
        "critical": [c for c in ranked if c["sev"] == "critical"],
        "high": [c for c in ranked if c["sev"] == "high"][:top_n],
        "false_positive_prone_checks": flagged,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("-o", "--out", default="prowler-summary.json")
    ap.add_argument("--top", type=int, default=40)
    a = ap.parse_args()

    result = summarize(a.csv_path, a.top)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    print(
        f"FAIL {result['total_fail']} / unique checks {result['unique_checks']} "
        f"/ critical {len(result['critical'])} -> {a.out}"
    )


if __name__ == "__main__":
    main()
