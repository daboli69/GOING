"""Backstop for GitHub's hourly schedule, which can run late or skip runs entirely.

  python publishers/refresh_site.py

Starts a live refresh unless a deployment succeeded in the last 40 minutes or a run is active.
Failed and cancelled runs do not postpone the backstop. Uses the same `gh` login as publish_models.py.
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
    r = gh("run", "list", "--workflow", "deploy.yml", "--limit", "5", "--json", "createdAt,updatedAt,status,conclusion,event")
    if r.returncode != 0:
        print(f"Could not list workflow runs: {(r.stderr or '').strip()[:200]}")
        return 1
    now = datetime.now(timezone.utc)
    for run in json.loads(r.stdout or "[]"):
        started = datetime.fromisoformat(run["createdAt"].replace("Z", "+00:00"))
        finished = datetime.fromisoformat(run["updatedAt"].replace("Z", "+00:00"))
        active = run["status"] in ("queued", "in_progress", "waiting", "pending", "requested")
        if active or run["conclusion"] == "success" and now - finished < WINDOW:
            print(f"A {run['event']} run started {int((now - started).total_seconds() // 60)} min ago ({run['status']}); nothing to do.")
            return 0
    r = gh("workflow", "run", "deploy.yml", "--ref", "main", "-f", "mode=live")
    print("Refresh started." if r.returncode == 0 else f"Refresh not started: {(r.stderr or '').strip()[:200]}")
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
