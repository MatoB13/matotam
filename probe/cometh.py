# One-off research: the Cometh marketplace API behind dolz.io/marketplace (URL and public key from its bundle).
import urllib.request, re, json
def get(url, headers=None, data=None):
    h = {"user-agent": "Mozilla/5.0", "origin": "https://dolz.io", "referer": "https://dolz.io/marketplace"}
    h.update(headers or {})
    if data is not None: h["content-type"] = "application/json"
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=h, data=json.dumps(data).encode() if data is not None else None), timeout=25)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        body = e.read().decode("utf-8", "replace") if hasattr(e, "read") else repr(e)
        return getattr(e, "code", 0), body
_, html = get("https://dolz.io/marketplace")
paths = set(re.findall(r'(static/chunks/[^"\\]+\.js)', html))
body = ""
for p in paths:
    body += "\n" + get("https://dolz.io/marketplace/_next/" + p)[1]
for k in ["COMETH_MARKETPLACE_API_URL", "MARKETPLACE_API_KEY", "cometh.io", "apikey", "x-api-key"]:
    for m in list(re.finditer(k, body))[:3]:
        print(f"[{k}]", body[max(0, m.start()-300): m.end()+300].replace("\n", " "), "\n")
urls = sorted(set(re.findall(r'https://[a-z0-9.\-]*cometh[a-z0-9.\-]*[a-zA-Z0-9_/\-.]*', body)))
print("cometh urls:", urls)
keys = sorted(set(re.findall(r'"([A-Za-z0-9_\-]{24,64})"', body)))
print("long strings near key:", [k for k in keys if not re.fullmatch(r"[0-9a-f]+", k)][:40])
# paths used with the marketplace SDK
print("api paths:", sorted(set(re.findall(r'"/(?:v\d/)?(?:assets|orders|collections|search|nfts)[^"]{0,80}"', body)))[:60])
open("/tmp/body.js", "w").write(body)
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
for base in urls[:4] + ["https://api.marketplace.cometh.io/v1", "https://api.marketplace.cometh.io"]:
    for path in [f"/assets/{NFT}/106215", f"/assets/137/{NFT}/106215", f"/v1/assets/{NFT}/106215"]:
        st, b = get(base.rstrip("/") + path)
        print(base + path, st, b[:600].replace("\n", " "))
