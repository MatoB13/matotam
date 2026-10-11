# One-off research: recent/upcoming DOLZ mint sales and the contract calls the app makes to buy.
import urllib.request, re, json, collections
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=30).read().decode("utf-8", "replace")
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())
plan = api({"command": "getAllSeasonsPlanning", "maxSeason": 20})
mint = plan.get("mint", {})
rows = [r for s in mint.values() for r in s]
rows.sort(key=lambda r: str(r.get("date") or r.get("startdate")))
print("mint rows", len(rows), "keys", sorted(rows[-1].keys()) if rows else None)
for r in rows[-14:]: print(json.dumps(r))
auc = [r for s in plan.get("auction", {}).values() for r in s]
auc.sort(key=lambda r: str(r.get("date")))
print("next auctions:"); [print(json.dumps(r)) for r in auc[-3:]]
if rows:
    c = rows[-1].get("contract")
    if c:
        print("saleSettings last:", json.dumps(api({"command": "getSaleSettings", "contractAddress": c}))[:1500])
        print("cardsInfos last:", json.dumps(api({"command": "getCardsInfos", "contractAddress": c}))[:800])
html = get("https://dolz.io/")
srcs = ["https://dolz.io" + s if s.startswith("/") else s for s in re.findall(r'src="([^"]+\.js[^"]*)"', html)]
body = "\n".join(get(s) for s in srcs)
fns = collections.Counter(re.findall(r'functionName\s*:\s*"([A-Za-z0-9_]+)"', body))
print("functionName:", fns.most_common(60))
for word in ["\"mintNFT\"", "\"buy\"", "safeMint", "publicMint", "mintWithSignature", "\"proxy\"", "maxPerWallet", "maxPerUser", "shrimp", "purchaseLimit", "userLimit", "\"mint\"," ]:
    for m in list(re.finditer(re.escape(word), body))[:2]:
        print(f"\n[{word}] ...{body[max(0,m.start()-500):m.end()+700]}")
