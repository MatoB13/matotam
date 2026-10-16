# One-off check: where the dolz.io marketplace reads revealed g0207 rarities from.
import urllib.request, json, re, time
def get(url, raw=False):
    try:
        b = urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
        return b if raw else json.loads(b)
    except Exception as e:
        return repr(e)[:120]
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode()[:700]
    except Exception as e:
        return repr(e)
d = get("https://cardsdata.dolz.io/jsons/106017.json")
print("106017 plain json rarity:", [a for a in d.get("attributes", []) if a.get("trait_type") == "Rarity"] if isinstance(d, dict) else d, d.get("image") if isinstance(d, dict) else "")
html = get("https://dolz.io/marketplace", raw=True)
srcs = ["https://dolz.io" + s if s.startswith("/") else s for s in re.findall(r'src="([^"]+\.js[^"]*)"', html)]
print("marketplace scripts", srcs[:8])
body = "\n".join(get(s, raw=True) for s in srcs if isinstance(get(s, raw=True), str))
cmds = sorted(set(re.findall(r'command\s*:\s*"([A-Za-z0-9_]+)"', body)))
print("marketplace commands:", cmds)
for c in ["getNFTsForAttributes", "getNFTInfos", "getMarketplaceOverview", "getUserNFTs", "getNFTEvents"]:
    for m in list(re.finditer(c, body))[:1]:
        print(f"\n== {c}: {body[max(0,m.start()-300):m.end()+400]}")
print("\ngetNFTInfos tokenId:", api({"command": "getNFTInfos", "tokenId": 106017}))
print("getNFTInfos id:", api({"command": "getNFTInfos", "id": 106017, "contract": "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"}))
print("getNFTsForAttributes:", api({"command": "getNFTsForAttributes", "attributes": {"Card Number": ["g0207"]}, "page": 1}))
