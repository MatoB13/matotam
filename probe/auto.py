# One-off research: do unclaimed DOLZ auction prizes get delivered automatically later? (public chain data)
import urllib.request, json, collections
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=40).read())
            if "result" in r: return r["result"]
        except Exception as e: pass
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
ESC = "0xd94298c2160ad8603216a3fa7a233ec609b2494d"
OLD = ["0xfc4690ab5f7115ab45d77687b1678435c12db350", "0xd745ec5f6e58d5682769717024d982db28359445"]
latest = int(rpc("eth_blockNumber", []), 16)
# sample escrow transfers across history: who sends, which function, to whom
for start in [latest - 4_000_000, latest - 2_000_000, latest - 300_000]:
    logs = rpc("eth_getLogs", [{"address": NFT, "topics": [T, "0x" + "0" * 24 + ESC[2:]], "fromBlock": hex(start), "toBlock": hex(start + 20000)}]) or []
    sels = collections.Counter(); seen = set()
    for l in logs[:40]:
        h = l["transactionHash"]
        if h in seen: continue
        seen.add(h); tx = rpc("eth_getTransactionByHash", [h])
        sels[(tx["from"][:10], tx["to"], tx["input"][:10])] += 1
    print("block", start, "escrow transfers", len(logs), "by (sender, to, selector):", dict(sels))
# calls to old auction contracts other than bid/updateBid/withdraw: transferToVault 0x602d5513 etc.
for c in OLD:
    for sel in ["0x602d5513", "0xdb2e21bc", "0x155dd5ee"]:
        pass
    # any logs from the auction after its end with topic not Bid*: list topics
    topics = collections.Counter()
    for start in range(latest - 3_000_000, latest, 500_000):
        for l in rpc("eth_getLogs", [{"address": c, "fromBlock": hex(start), "toBlock": hex(min(latest, start + 499_999))}]) or []:
            topics[l["topics"][0][:10]] += 1
    print("auction", c, "event topics", dict(topics))
