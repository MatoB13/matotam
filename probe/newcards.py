# One-off research: which DolzNFT tokens the auction prizes are (recent transfers to the user's two wallets).
import urllib.request, json
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=40).read())
            if "result" in r: return r["result"]
            print("err", r.get("error"))
        except Exception as e: print("ex", e)
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
print("startingTokenId", rpc("eth_call", [{"to": C, "data": "0xb4f18d8d"}, "latest"]))
latest = int(rpc("eth_blockNumber", []), 16)
for w in ["0xa4cd3de07dafa3f700c908043118b39547190143", "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"]:
    for s in range(latest - 8000, latest, 4000):
        for l in rpc("eth_getLogs", [{"topics": [T, None, "0x" + "0" * 24 + w[2:]], "fromBlock": hex(s), "toBlock": hex(min(latest, s + 3999))}]) or []:
            if len(l["topics"]) == 4:
                print(w[:8], "got token", int(l["topics"][3], 16), "contract", l["address"], "from", "0x" + l["topics"][1][-40:], "block", int(l["blockNumber"], 16))
