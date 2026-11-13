"""Export the NBA ensemble's saved Game Center forecasts (nba_lab.gamecenter_data) to a JSON file.

Run with the NBA project's own Python:  <nba>\\.venv\\Scripts\\python.exe export_nba.py <nba dir> <out.json>
Reads saved forecasts only; never refits or writes inside the project.
"""
import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

lab, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
sys.path.insert(0, str(lab))
warnings.filterwarnings("ignore")

from nba_lab import gamecenter_data as D  # noqa: E402

DAYS = 30  # most recent saved forecast days to publish
meta = D.clean(D.meta())
dates = meta.get("dates", [])[-DAYS:]
days, games = {}, {}
for day in dates:
    rows = D.day_games(day)
    days[day] = rows
    for row in rows:
        detail = D.game_detail(str(row["gid"]))
        if not detail:
            continue
        # The page draws only the margin curve; drop the rest to keep the file small.
        detail["distribution"] = {"margin": (detail.get("distribution") or {}).get("margin", [])}
        for team in (detail.get("injuries") or {}).get("teams", {}).values():
            for item in team:
                item.pop("note", None)
        games[str(row["gid"])] = detail
meta["dates"] = dates
export = {"schema": "going-nba-feed", "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
          "meta": meta, "glossary": D.glossary(), "days": days, "games": games}
out.write_text(json.dumps(D.clean(export), separators=(",", ":")), encoding="utf-8")
print(f"NBA feed: {len(days)} days, {len(games)} games")
