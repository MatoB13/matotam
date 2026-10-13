# One-off check: functions, payment token and whitelist of the g0207 sale contract.
import urllib.request, json, re
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=90).read())
    return r.get("result", r.get("error"))
def sig(sel):
    try:
        j = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://www.4byte.directory/api/v1/signatures/?hex_signature=0x{sel}", headers={"user-agent": "x"}), timeout=20).read())
        return [r["text_signature"] for r in j["results"]][:3]
    except Exception as e:
        return repr(e)
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())
S = "0x6390e6cd5ca7b3be4ba7b97e936f5d596ec2f3b4"
code = rpc("eth_getCode", [S, "latest"])[2:]
sels = sorted(set(re.findall(r"63([0-9a-f]{8})(?=80?14|14)", code)))
print("selectors", len(sels))
for s in sels:
    res = rpc("eth_call", [{"to": S, "data": "0x" + s}, "latest"])
    print(" ", s, sig(s), "->", str(res)[:140])
print("storage:")
for slot in range(30):
    v = rpc("eth_getStorageAt", [S, hex(slot), "latest"])
    if int(v, 16): print("  slot", slot, v)
wl = api({"command": "getWhitelistForCard", "card": "g0207"})
print("whitelist size", len(wl))
for n, w in {"main": "0xa4cd3de07dafa3f700c908043118b39547190143", "hot": "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6", "kernel": "0x49fcb83bed9983b9b9e4cf4e067c66e70d874a9d"}.items():
    print(n, "on whitelist:", wl.get(w))
# how g0201 differed: where did the old public mint go? creation tx of the new contract
