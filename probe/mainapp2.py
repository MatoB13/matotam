# One-off research: the API module of the dolz.io main app (URL `d`, decoder `h`, encoder `l`) and a decoded getNFTInfos.
import urllib.request, re, json, base64
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception: return ""
html = get("https://dolz.io/")
body = "".join(get("https://dolz.io" + s) for s in re.findall(r'src="(/static/js/[^"]+\.js)"', html))
i = body.find('const m=window.location.search.toLowerCase().includes("mockusdc")')
print(body[max(0, i-4000): i+100])
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
for url in ["https://back.dolz.io/api.php"]:
    for p in [{"command": "getNFTInfos", "contractAddress": NFT, "nftId": "106215"}, {"command": "getNFTInfos", "contractAddress": NFT, "nftId": 106215}]:
        r = urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(p).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"}), timeout=30)
        raw = r.read(); print(url, p["nftId"], r.status, len(raw), raw[:300])
