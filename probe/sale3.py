# One-off research: sale contract source (Sourcify), whitelist API answers, per-wallet state.
import urllib.request, json
def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=30).read().decode()
    except Exception as e:
        return repr(e)
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode()[:2500]
    except Exception as e:
        return repr(e)
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read()))
    return r.get("result", r.get("error"))
S = "0x56b199b39bfa1d6fff8c363a7116ee34274a747e"
for url in [f"https://sourcify.dev/server/v2/contract/137/{S}?fields=sources", f"https://repo.sourcify.dev/contracts/full_match/137/{S}/metadata.json", f"https://repo.sourcify.dev/contracts/partial_match/137/{S}/metadata.json"]:
    body = get(url)
    print("SOURCIFY", url, body[:300])
    if body.startswith("{") and "sources" in body:
        j = json.loads(body)
        for name, src in (j.get("sources") or {}).items():
            content = src.get("content") if isinstance(src, dict) else None
            if content and "function" in content:
                print("=====", name, len(content)); print(content[:12000])
        break
W = {"main": "0xa4cd3de07dafa3f700c908043118b39547190143", "hot": "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6", "kernel": "0x49fcb83bed9983b9b9e4cf4e067c66e70d874a9d"}
print("whitelist g0201:", api({"command": "getWhitelistForCard", "card": "g0201"})[:1500])
print("whitelist g0207:", api({"command": "getWhitelistForCard", "card": "g0207"})[:1500])
for k, w in W.items():
    print("presaleUser", k, api({"command": "presaleUser", "wallet": w})[:600])
    print("mintedByUser", k, rpc("eth_call", [{"to": S, "data": "0x7340d2d2" + w[2:].rjust(64, "0")}, "latest"]))
for name, sel in [("merkleRoot", "0x2eb4a7ab"), ("usdtPrice", "0xe136f65f"), ("usdtToken", "0xa98ad46c"), ("token", "0xfc0c546a"), ("nftOwner", "0x4c39a749"), ("owner", "0x8da5cb5b")]:
    print(name, rpc("eth_call", [{"to": S, "data": sel}, "latest"]))
# unknown no-arg getters: try them all
for sel in ["2899a783", "37b766a5", "41b69a3c", "583970fb", "6f0ed2a3", "71b057a2", "75a8e1d3", "7873856b", "8044f604", "9d5e5d7b", "a51758d8", "c0d62181", "cb5d4f83", "f9ac6935", "fa87b47f"]:
    print("call", sel, rpc("eth_call", [{"to": S, "data": "0x" + sel}, "latest"]))
