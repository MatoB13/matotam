# One-off research: the dolz.io getUserWithdraw call (public frontend code) and its answer for the sniper hot wallet.
import re, urllib.request, json
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36", "origin": "https://dolz.io", "referer": "https://dolz.io/"}
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")
    except Exception as e: return ""
page = get("https://dolz.io/auction/0x9e8c5bb7a649a77e80E04300916cD85f3304bb69")
mainsrc = re.findall(r'src="(/static/js/main\.[0-9a-f]+\.js)"', page)
print("main", mainsrc, len(page))
main = get("https://dolz.io" + mainsrc[0]) if mainsrc else ""
i = main.find('"static/js/"+'); seg = main[i:i + 60000]
ids = re.findall(r'(\d+):"([0-9a-f]{8})"', seg); names = dict(re.findall(r'(\d+):"([a-zA-Z0-9_-]+)"', seg[:20000]))
srcs = [("main", main)]
for cid, h in ids:
    name = names.get(cid, cid)
    if "syntax" in name: continue
    js = get(f"https://dolz.io/static/js/{name}.{h}.chunk.js")
    if re.search(r'getUserWithdraw|functionName:"withdraw"|rootSign|getContractBids', js): srcs.append((name, js))
print("srcs", [n for n, _ in srcs])
for name, js in srcs:
    for pat in [r'getUserWithdraw', r'functionName:"withdraw"', r'rootSign']:
        for m in list(re.finditer(pat, js))[:3]:
            print(f"\n=== {name} {pat}\n", js[max(0, m.start() - 1500): m.end() + 2500].replace("\n", " "))
W = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
for body in [{"command": "getUserWithdraw", "address": W, "contract": C}, {"command": "getUserWithdraw", "wallet": W, "contract": C},
             {"command": "getUserWithdraw", "userAddress": W, "contractAddress": C}, {"command": "getUserWithdraw", "address": W, "auction": C}]:
    try:
        r = urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(body).encode(), headers={**UA, "content-type": "application/json"}), timeout=30).read().decode()
        print("\nCALL", list(body.keys()), "->", r[:3000])
    except Exception as e:
        print("\nCALL", list(body.keys()), "ERR", e)
