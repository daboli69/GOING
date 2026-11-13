"""Compact the public archives into event and game logs for the browser."""
import csv, gzip, json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
cache = root / ".cache"
public = root / "site" / "data"
public.mkdir(parents=True, exist_ok=True)
year = int(sys.argv[1])
hoops_year = int(sys.argv[2]) if len(sys.argv)>2 else year+1

def rows(name):
    p = cache / name
    with (gzip.open(p, "rt", encoding="utf-8-sig", newline="") if p.suffix == ".gz"
          else p.open(encoding="utf-8-sig", newline="")) as f:
        yield from csv.DictReader(f)

def num(x, default=None):
    try:
        n = float(x)
        return int(n) if n.is_integer() else n
    except (ValueError, TypeError):
        return default

def write(name, obj):
    path = public / f"{name}.json"
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(path)

def games():
    for r in rows("nfl-schedule.csv"):
        if num(r["season"],0) not in (year,year-1) or r["game_type"] != "REG":
            continue
        yield dict(id=r["game_id"],date=r["gameday"],time=r["gametime"],week=num(r["week"]),
                   a=r["away_team"],h=r["home_team"],sa=num(r["away_score"]),sh=num(r["home_score"]),
                   spread=num(r["spread_line"]),total=num(r["total_line"]),am=num(r["away_moneyline"]),
                   hm=num(r["home_moneyline"]),venue=r["stadium"],espn=r["espn"],roof=r["roof"],
                   temp=num(r["temp"]),wind=num(r["wind"]))

def nfl(y):
    roster = {}
    for r in rows(f"nfl-roster-{y}.csv"):
        if r["gsis_id"]:
            roster[r["gsis_id"]] = [r["full_name"], r["position"], r["headshot_url"]]
    used = {}
    events = {}
    for r in rows(f"nfl-{y}.csv.gz"):
        if r["season_type"] != "REG" or not r["posteam"] and r["touchdown"] != "1":
            continue
        a = r["posteam"]
        ty = r["play_type"]
        yd = num(r["yards_gained"],0)
        istd = r["touchdown"] == "1"
        fga = r["field_goal_attempt"] == "1"
        if not (ty in ("pass","run","punt","field_goal","no_play","qb_kneel","qb_spike") or istd or fga):
            continue
        def player(field):
            i = r.get(field+"_player_id","")
            if i and i not in used:
                used[i] = roster.get(i) or [r.get(field+"_player_name",""),"", ""]
            return i
        events.setdefault(r["game_id"], []).append([
            a, ty, yd, num(r["yardline_100"]), num(r["qtr"],0), num(r["game_seconds_remaining"],0),
            num(r["fixed_drive"]), r["fixed_drive_result"], r["td_team"] if istd else "",
            player("td") if istd else "", player("passer"), player("receiver"), player("rusher"),
            num(r["air_yards"]), num(r["yards_after_catch"]), num(r["complete_pass"],0),
            num(r["success"]), num(r["epa"]), r["pass_location"], r["run_location"],
            int(fga), r["field_goal_result"], int(r["return_touchdown"]=="1"),
            r["desc"] if istd else "", num(r.get("down")), num(r.get("ydstogo")),
        ])
    write(f"nfl-{y}",dict(players=used, events=events))

def nba(y):
    teams, players, playerGames, teamGames, shotGames, first, assists, gameDates = {},{},{},{},{},{},{},{}
    def regular(r): return r["season_type"] == "2"
    for r in rows(f"nba-team-{y}.csv"):
        if not regular(r): continue
        t=r["team_abbreviation"]; g=r["game_id"]; gameDates[g]=r["game_date"]
        teams[t]=[r["team_display_name"],r["team_logo"],r["team_color"],r["team_id"]]
        teamGames.setdefault(t,[]).append([g,r["game_date"],r["opponent_team_abbreviation"],r["team_home_away"],
            *[num(r[k],0) for k in ("team_score","opponent_team_score","field_goals_made","field_goals_attempted",
            "three_point_field_goals_made","three_point_field_goals_attempted","free_throws_attempted",
            "offensive_rebounds","defensive_rebounds","total_turnovers","points_in_paint","fast_break_points",
            "assists","steals","free_throws_made","total_rebounds")]])
    for r in rows(f"nba-box-{y}.csv"):
        if not regular(r) or r["did_not_play"]=="true" or not num(r["minutes"],0): continue
        i=r["athlete_id"]; t=r["team_abbreviation"]
        players.setdefault(i,[r["athlete_display_name"],r["athlete_position_abbreviation"],r["athlete_headshot_href"],t])
        playerGames.setdefault(i,[]).append([r["game_id"],r["game_date"],t,r["opponent_team_abbreviation"],r["home_away"],
            *[num(r[k],0) for k in ("minutes","points","three_point_field_goals_made","assists","rebounds",
              "field_goals_attempted","three_point_field_goals_attempted","free_throws_attempted","offensive_rebounds",
              "defensive_rebounds","field_goals_made")],int(r["starter"]=="true")])
    pat=re.compile(r"(\d+)[ -]foot")
    def shot_type(t,has_assist,dist,three):
        t=t.lower()
        for text,key in (("putback","Putback"),("alley oop","Lob"),("cutting","Cut"),("driving","Drive"),
                         ("hook","Hook"),("floating","Floater"),("fade","Fade"),("pullup","Pull-up"),("step back","Pull-up")):
            if text in t: return key
        if three and has_assist: return "Catch & Shoot"
        return "Inside" if dist<6 else "Jumper"
    for r in rows(f"nba-pbp-{y}.csv"):
        if not regular(r): continue
        g=r["game_id"]; i=r["athlete_id_1"]
        team=r["home_team_abbrev"] if r["team_id"]==r["home_team_id"] else r["away_team_abbrev"]
        opp=r["away_team_abbrev"] if r["team_id"]==r["home_team_id"] else r["home_team_abbrev"]
        pts=num(r["score_value"],0)
        is_make=r["scoring_play"]=="true" and pts>0
        typ=r["type_text"]
        field=r["shooting_play"]=="true" and "Free Throw" not in typ
        if num(r["period_number"])==1 and (field or is_make or "Jumpball" in typ):
            z=first.setdefault(g,{"date":r["game_date"],"by":{},"tip":""})
            b=z["by"].setdefault(team,{})
            if "Jumpball" in typ and not z["tip"] and r["team_id"] in (r["home_team_id"],r["away_team_id"]): z["tip"]=team
            if field and "shot" not in b: b["shot"]=i
            if is_make and "pts" not in b: b["pts"]=i
            if is_make and field and "fg" not in b: b["fg"]=i
            if field and "firstShot" not in z: z["firstShot"]=i
            if is_make and "firstPts" not in z: z["firstPts"]=i
            if is_make and field and "firstFg" not in z: z["firstFg"]=i
        if not field or not i: continue
        x=num(r["coordinate_x"]); yy=num(r["coordinate_y"]); ar=num(r["points_attempted"],pts)
        m=pat.search(r["text"]); dist=int(m[1]) if m else round(((abs(x)-41.75)**2+yy**2)**.5,1) if x is not None and yy is not None else (25 if ar==3 else 2)
        k=shot_type(typ,bool(r["athlete_id_2"]),dist,ar==3)
        shotGames.setdefault(g,[]).append([i,team,opp,x,yy,dist,ar,int(is_make),k,
            int(num(r["period_number"])==1 and num(r["start_quarter_seconds_remaining"],0)>=540)])
        if is_make and r["athlete_id_2"] and r["athlete_id_2"]!=i:
            assists.setdefault(r["athlete_id_2"],[]).append([g,i,team,k,ar])
    write(f"nba-{y}",dict(teams=teams,players=players,pg=playerGames,tg=teamGames,first=first,assists=assists,dates=gameDates))
    write(f"nba-shots-{y}",shotGames)

write("nfl-schedule", list(games()))
for mode, target in (("nfl", year), ("nba", hoops_year)):
    try:
        (nfl if mode=="nfl" else nba)(target)
    except FileNotFoundError as e:
        print(f"{mode.upper()} archive not published: {e.filename}",file=sys.stderr)
