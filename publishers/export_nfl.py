"""Export the NFL Ensemble Lab's sanitised GOING feed (lab.going_feed) to a JSON file.

Run with the lab's own Python:  <lab>\\.venv\\Scripts\\python.exe export_nfl.py <lab dir> <out.json>
Reads local lab files only; never writes inside the lab.
"""
import json
import sys
import warnings
from pathlib import Path

lab, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
sys.path.insert(0, str(lab))
warnings.filterwarnings("ignore")

from lab.going_feed import build, validate  # noqa: E402

feed = build()
errors = validate(feed)
if errors:
    sys.exit("NFL feed failed validation: " + "; ".join(map(str, errors[:5])))
out.write_text(json.dumps(feed, separators=(",", ":")), encoding="utf-8")
print(f"NFL feed: {len(feed['games'])} games")
