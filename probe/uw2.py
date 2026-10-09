# One-off research: shape of the public getUserWithdraw answer (DOLZ auction prize withdrawal data).
import urllib.request, json
UA = {"user-agent": "Mozilla/5.0 Chrome/126", "origin": "https://dolz.io", "referer": "https://dolz.io/", "content-type": "application/json"}
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
def post(body):
    try: return urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(body).encode(), headers=UA), timeout=30).read().decode()[:2500]
    except Exception as e: return f"ERR {e}"
for user in ["0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6", "0x115EC4f0cb8fc4515fB9e172df97da5d463Dd6f6", "0x25590b4f10afdb05f806219329784a8bd45bdce5", "0xc049724617e9a86767c77833cf79345edf9a290a", "0xa4cd3de07dafa3f700c908043118b39547190143"]:
    for c in [C, "0x9e8c5bb7a649a77e80E04300916cD85f3304bb69"]:
        print(user[:12], c[-6:], "->", post({"command": "getUserWithdraw", "contractAddress": c, "userAddress": user}))
print("contractBids", post({"command": "getContractBids", "contractAddress": C})[:800])
