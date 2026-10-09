# One-off research: how the sniper hot wallet's own prize withdrawal was made (its own transaction + dolz.io data).
import urllib.request, json
from eth_abi import decode
UA = {"user-agent": "Mozilla/5.0 Chrome/126", "origin": "https://dolz.io", "referer": "https://dolz.io/", "content-type": "application/json"}
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"; HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=40).read())
            if "result" in r: return r["result"]
        except Exception: pass
def post(b): return urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(b).encode(), headers=UA), timeout=30).read().decode()
print("getUserWithdraw hot:", post({"command": "getUserWithdraw", "contractAddress": C, "userAddress": HOT}))
print("checkWalletLinked hot:", post({"command": "checkWalletLinked", "wallet": HOT}))
latest = int(rpc("eth_blockNumber", []), 16)
logs = rpc("eth_getLogs", [{"address": C, "fromBlock": hex(latest - 4000), "toBlock": hex(latest)}]) or []
for l in logs:
    if HOT[2:] in l["data"].lower() or any(HOT[2:] in t for t in l["topics"]):
        tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
        print("\nTX", l["transactionHash"], "block", int(l["blockNumber"], 16), "from", tx["from"], "to", tx["to"], "selector", tx["input"][:10])
        if tx["input"][:10] == "0xb5c1d22d":
            (t, r, a), leaf, proof = decode(["(uint256[],uint256,address)", "bytes32", "bytes32[]"], bytes.fromhex(tx["input"][10:]))
            print("  tokens", t, "refund", r, "claimer", a, "proof length", len(proof))
