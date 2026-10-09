# One-off research: how the dolz.io frontend turns getUserWithdraw data into the withdraw() call.
import urllib.request, json, re
UA = {"user-agent": "Mozilla/5.0 Chrome/126", "origin": "https://dolz.io", "referer": "https://dolz.io/", "content-type": "application/json"}
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
def post(body):
    try: return urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(body).encode(), headers=UA), timeout=30).read().decode()
    except Exception as e: return f"ERR {e}"
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": UA["user-agent"]}), timeout=30).read().decode("utf-8", "replace")
    except Exception: return ""
for body in [{"command": "getUserWithdraw", "contractAddress": C}, {"command": "getUserWithdraw", "contractAddress": C, "userAddress": ""}]:
    r = post(body); print("ALL?", list(body.keys()), len(r), r[:600])
print("hot", post({"command": "getUserWithdraw", "contractAddress": C, "userAddress": "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"}))
main = get("https://dolz.io/static/js/main.f0a2dbee.js")
i = main.find('"static/js/"+'); seg = main[i:i + 60000]
ids = re.findall(r'(\d+):"([0-9a-f]{8})"', seg); names = dict(re.findall(r'(\d+):"([a-zA-Z0-9_-]+)"', seg[:20000]))
srcs = [("main", main)]
for cid, h in ids:
    name = names.get(cid, cid)
    if "syntax" in name: continue
    js = get(f"https://dolz.io/static/js/{name}.{h}.chunk.js")
    if "daw" in js: srcs.append((name, js))
for name, js in srcs:
    for m in list(re.finditer(r'dawTokenIDs|dawRefundAmount|dawClaimer', js))[:4]:
        print(f"\n=== {name}\n", js[max(0, m.start() - 2500): m.end() + 2500].replace("\n", " "))
