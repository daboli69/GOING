"""Publish the local ensemble model outputs to GOING.

  python publishers/publish_models.py            # export both labs, write site/data/models/ for local preview
  python publishers/publish_models.py --push     # also commit to the `model-feeds` branch and start a site deploy

How the push works: the three JSON files are committed to the `model-feeds` branch with git plumbing
(hash-object / mktree / commit-tree), so the checkout, its index and main are never touched. When the
forecasts have not changed since the last publication, nothing is pushed and no deploy runs.
The GitHub workflow reads that branch on every deploy, so the site keeps the latest forecasts while this PC is off.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

HUB = Path(__file__).resolve().parents[1]
RESEARCH = Path(os.environ.get("GOING_RESEARCH", Path.home() / "OneDrive/Documents/ChatGPT/GOING/research"))
NFL_LAB = Path(os.environ.get("GOING_NFL_LAB", RESEARCH / "nfl-ensemble-lab"))
NBA_LAB = Path(os.environ.get("GOING_NBA_LAB", RESEARCH / "NBA ensemble"))
BRANCH = "model-feeds"
LOCAL = HUB / "site" / "data" / "models"


def git(*args: str, data: bytes | None = None) -> str:
    r = subprocess.run(["git", "-C", str(HUB), *args], input=data, capture_output=True, timeout=180)
    if r.returncode:
        raise RuntimeError(f"git {' '.join(args[:2])}: {r.stderr.decode('utf-8', 'replace').strip()[:300]}")
    return r.stdout.decode("utf-8", "replace").strip()


def export(script: str, lab: Path) -> dict | None:
    py = lab / ".venv" / "Scripts" / "python.exe"
    if not py.exists():
        py = lab / ".venv" / "bin" / "python"
    if not py.exists():
        print(f"Skipped {script}: no virtual environment in {lab}")
        return None
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "feed.json"
        r = subprocess.run([str(py), str(HUB / "publishers" / script), str(lab), str(out)], cwd=str(lab),
                           capture_output=True, text=True, timeout=900)
        if r.returncode:
            print(f"{script} failed:\n{(r.stderr or r.stdout)[-1500:]}")
            return None
        print(r.stdout.strip())
        return json.loads(out.read_text(encoding="utf-8"))


def published() -> dict:
    """The files currently on origin/model-feeds, or {} before the first publication."""
    try:
        git("fetch", "--quiet", "origin", f"+refs/heads/{BRANCH}:refs/remotes/origin/{BRANCH}")
    except RuntimeError:
        return {}
    files = {}
    for name in ("nfl", "nba", "summary"):
        try:
            files[name] = json.loads(git("show", f"refs/remotes/origin/{BRANCH}:models/{name}.json"))
        except (RuntimeError, json.JSONDecodeError):
            pass
    return files


def merge_nfl(new: dict, old: dict | None) -> dict:
    """The lab feed covers about two weeks; keep earlier games of the same season so past weeks stay browsable."""
    if not old:
        return new
    seasons = {g["season"] for g in new["games"]}
    keep = {g["game_id"]: g for g in old.get("games", []) if g.get("season") in seasons}
    keep.update({g["game_id"]: g for g in new["games"]})
    return {**new, "games": sorted(keep.values(), key=lambda g: g["kickoff_utc"])}


def top_pick(rows):
    best = None
    for team, opp, p in rows:
        if p is None:
            continue
        fav, pf, other = (team, p, opp) if p >= 0.5 else (opp, 1 - p, team)
        if not best or pf > best["p"]:
            best = {"team": fav, "p": round(pf, 4), "opp": other}
    return best


def summary(nfl: dict | None, nba: dict | None) -> dict:
    out = {}
    if nfl:
        upcoming = sorted((g for g in nfl["games"] if g["status"] != "final"), key=lambda g: g["kickoff_utc"])
        week = [g for g in upcoming if upcoming and (g["season"], g["week"]) == (upcoming[0]["season"], upcoming[0]["week"])]
        champ = next((v for v in nfl.get("performance", {}).get("prospective", {}).get("by_version", []) if v.get("label") == "Champion"), None)
        out["nfl"] = {"generated_at": nfl["generated_at"],
                      "top": top_pick([(g["home_team"], g["away_team"], ((g.get("forecast") or {}).get("champion") or {}).get("p_home")) for g in week]),
                      "record": {"games": champ["games"], "accuracy": champ["accuracy"]} if champ else None}
    if nba:
        today = datetime.now().strftime("%Y-%m-%d")
        day = next((d for d in sorted(nba["days"]) if d >= today), None)
        rows = [r for r in nba["days"].get(day, []) if not r.get("completed")] if day else []
        tr = nba["meta"].get("track_record") or {}
        out["nba"] = {"generated_at": nba["generated_at"], "date": day,
                      "top": top_pick([(r["home"], r["away"], r.get("p_home")) for r in rows]),
                      "record": {"games": tr.get("games"), "accuracy": tr.get("accuracy")} if tr.get("games") else None}
    return out


IGNORED = {"generated_at", "freshness", "retrieved_at"}  # timestamps that move on every lab refresh


def fingerprint(feed: dict | None) -> str:
    """Hash of the content that matters, so a refreshed timestamp alone never triggers a deploy."""
    def strip(x):
        if isinstance(x, dict):
            return {k: strip(v) for k, v in x.items() if k not in IGNORED}
        if isinstance(x, list):
            return [strip(v) for v in x]
        return x
    return hashlib.sha256(json.dumps(strip(feed), sort_keys=True).encode()).hexdigest() if feed else ""


def push(files: dict[str, dict], message: str) -> str:
    entries = ""
    for name, data in files.items():
        blob = git("hash-object", "-w", "--stdin", data=json.dumps(data, separators=(",", ":")).encode())
        entries += f"100644 blob {blob}\t{name}.json\n"
    models = git("mktree", data=entries.encode())
    tree = git("mktree", data=f"040000 tree {models}\tmodels\n".encode())
    try:
        parent = git("rev-parse", f"refs/remotes/origin/{BRANCH}")
    except RuntimeError:
        parent = None
    commit = git("commit-tree", tree, *(["-p", parent] if parent else []), "-m", message)
    git("push", "--quiet", "origin", f"{commit}:refs/heads/{BRANCH}")
    return commit


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--push", action="store_true", help="publish to origin/model-feeds and start a deploy")
    args = ap.parse_args()
    old = published()
    nfl = export("export_nfl.py", NFL_LAB)
    nba = export("export_nba.py", NBA_LAB)
    nfl = merge_nfl(nfl, old.get("nfl")) if nfl else old.get("nfl")
    nba = nba or old.get("nba")
    if not nfl and not nba:
        print("Nothing to publish.")
        return 1
    files = {k: v for k, v in (("nfl", nfl), ("nba", nba)) if v}
    files["summary"] = summary(nfl, nba)
    LOCAL.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (LOCAL / f"{name}.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {LOCAL}")
    if not args.push:
        return 0
    if all(fingerprint(files.get(k)) == fingerprint(old.get(k)) for k in ("nfl", "nba")):
        print("Forecasts unchanged since the last publication; nothing pushed.")
        return 0
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    commit = push(files, f"Model feeds {stamp}")
    print(f"Pushed {commit[:10]} to {BRANCH}")
    r = subprocess.run(["gh", "workflow", "run", "deploy.yml", "--ref", "main", "-f", "mode=models"], cwd=str(HUB),
                       capture_output=True, text=True)
    print("Deploy started." if r.returncode == 0 else f"Deploy not started ({(r.stderr or '').strip()[:200]}); the next scheduled run will pick it up.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
