"""Backstop for GitHub's hourly schedule, which can run late or skip runs entirely.

  python publishers/refresh_site.py

Starts a live refresh of the site unless a workflow run has started in the last 40 minutes (scheduled, manual or
model publish), so it never doubles up on a run GitHub did make. Uses the same `gh` login as publish_models.py.
install_refresh_task.bat registers it as an hourly Windows scheduled task.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HUB = Path(__file__).resolve().parents[1]
WINDOW = timedelta(minutes=40)


def gh(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["gh", *args], cwd=str(HUB), capture_output=True, text=True)


def main() -> int:
    r = gh("run", "list", "--workflow", "deploy.yml", "--limit", "5", "--json", "createdAt,status,event")
    if r.returncode != 0:
        print(f"Could not list workflow runs: {(r.stderr or '').strip()[:200]}")
        return 1
    now = datetime.now(timezone.utc)
    for run in json.loads(r.stdout or "[]"):
        started = datetime.fromisoformat(run["createdAt"].replace("Z", "+00:00"))
        if run["status"] in ("queued", "in_progress", "waiting", "pending") or now - started < WINDOW:
            print(f"A {run['event']} run started {int((now - started).total_seconds() // 60)} min ago ({run['status']}); nothing to do.")
            return 0
    r = gh("workflow", "run", "deploy.yml", "--ref", "main", "-f", "mode=live")
    print("Refresh started." if r.returncode == 0 else f"Refresh not started: {(r.stderr or '').strip()[:200]}")
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
