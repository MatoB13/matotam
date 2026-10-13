# One-off check before the g0207 drop: new sale contract approved by the DOLZ wallet, whitelist, planning.
import urllib.request, json
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=90).read())
    return r.get("result", r.get("error"))
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    return urllib.request.urlopen(req, timeout=30).read().decode()
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; DOLZW = "0xd94298c2160ad8603216a3fa7a233ec609b2494d"
AFA = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31"
latest = int(rpc("eth_blockNumber", []), 16)
logs = rpc("eth_getLogs", [{"address": NFT, "topics": [AFA, "0x" + DOLZW[2:].rjust(64, "0")], "fromBlock": hex(latest - 40 * 43200), "toBlock": "latest"}])
for l in logs if isinstance(logs, list) else [logs]:
    op = "0x" + l["topics"][2][-40:]
    print("ApprovalForAll", int(l["blockNumber"], 16), (latest - int(l["blockNumber"], 16)) / 43200, "days ago", op, "approved", int(l["data"], 16))
    code = rpc("eth_getCode", [op, "latest"])
    print("   code size", (len(code) - 2) // 2, "has ccbfc08b", "63ccbfc08b" in code, "f2f3a93a", "63f2f3a93a" in code)
    for name, sel in [("token", "0xfc0c546a"), ("settings", "0x8044f604"), ("cap", "0x41b69a3c"), ("root", "0x2eb4a7ab"), ("usdtPrice", "0xe136f65f"), ("usdtToken", "0xa98ad46c")]:
        print("   ", name, str(rpc("eth_call", [{"to": op, "data": sel}, "latest"]))[:330])
print("whitelist g0207:", api({"command": "getWhitelistForCard", "card": "g0207"})[:300])
plan = json.loads(api({"command": "getAllSeasonsPlanning", "maxSeason": 99}))
print("planning g0207:", [r for s in plan.get("mint", {}).values() for r in s if r.get("cardNumber") == "g0207"])
