# One-off research: does the Cometh API answer (TLS check off, read-only), and where the marketplace bundle reads rarity.
import urllib.request, ssl, json, re
K = {"apikey": "jiQMsnsP86vV3Y3X2CsYV0rmmwHIrl5z", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"}
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; B = "https://api.marketplace.cometh.io/v1"
ctx = ssl._create_unverified_context()
def call(path, data=None):
    h = dict(K)
    if data is not None: h["content-type"] = "application/json"
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path, headers=h, data=json.dumps(data).encode() if data is not None else None), timeout=25, context=ctx)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), (e.read().decode("utf-8", "replace") if hasattr(e, "read") else repr(e))
for id in ("106215", "106017"):
    s, b = call(f"/assets/{NFT}/{id}"); print(id, s, b[:2000], "\n")
s, b = call("/assets/search", {"contractAddress": NFT, "attributes": [{"Card Number": ["g0207"]}], "limit": 2}); print("search", s, b[:1500], "\n")
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception: return ""
html = get("https://dolz.io/marketplace")
body = "".join(get("https://dolz.io/marketplace/_next/" + p) for p in set(re.findall(r'(static/chunks/[^"\\]+\.js)', html)))
for k in ["Not revealed", "Rarity", "rarity", "Serial", "searchAssets", "getAsset", "back.dolz", "cardsdata"]:
    ms = list(re.finditer(k, body)); print(f"\n### {k}: {len(ms)}")
    for m in ms[:3]: print(body[max(0, m.start()-250): m.end()+250].replace("\n", " "), "\n")
