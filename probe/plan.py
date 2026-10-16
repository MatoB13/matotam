# One-off research: does DOLZ's season planning list reveal dates (keys, g0207 rows, anything mentioning reveal)?
import urllib.request, json
r = urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps({"command": "getAllSeasonsPlanning", "maxSeason": 99}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"}), timeout=30)
plan = json.loads(r.read())
print("top keys", list(plan.keys()))
for k, v in plan.items():
    rows = [row for season in (v.values() if isinstance(v, dict) else [v]) for row in (season if isinstance(season, list) else [season])]
    print(k, len(rows), "row keys:", sorted({kk for row in rows if isinstance(row, dict) for kk in row})[:40])
    for row in rows:
        t = json.dumps(row)
        if "g0207" in t or "g0208" in t or "eveal" in t:
            print("  ", t[:600])
