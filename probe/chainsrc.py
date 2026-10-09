# One-off research: chain-only data sources for the portfolio (sales events, card JSON, log timestamps, pool swaps).
import urllib.request, json, collections
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read())
    return r.get("result"), r.get("error")
SM = "0xe7693ba9cf616a55b88f3ca7b74db3358b5767ee"
latest = int(rpc("eth_blockNumber", [])[0], 16)
logs, err = rpc("eth_getLogs", [{"address": SM, "fromBlock": hex(latest - 20000), "toBlock": "latest"}])
print("SalesManager logs", len(logs or []), err)
c = collections.Counter(l["topics"][0] for l in logs or [])
print(c)
for l in (logs or [])[:2]: print(json.dumps(l)[:900])
# transaction of a sale: input
if logs:
    tx, _ = rpc("eth_getTransactionByHash", [logs[0]["transactionHash"]]); print("tx input", tx["input"][:330], "to", tx["to"])
    rc, _ = rpc("eth_getTransactionReceipt", [logs[0]["transactionHash"]]); print("receipt logs", [(x["address"][:10], x["topics"][0][:10], len(x["topics"])) for x in rc["logs"]])
for tid in ["105428", "86038", "40392"]:
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://cardsdata.dolz.io/jsons/{tid}.json", headers={"user-agent": "Mozilla/5.0"}), timeout=20).read())
        print("cardsdata", tid, json.dumps(d)[:600])
    except Exception as e: print("cardsdata", tid, "ERR", e)
# pool swaps via rpc
pool = "0xc56ddb5c93b8e92b9409dce43a9169aa643495b8"
sw, err = rpc("eth_getLogs", [{"address": pool, "topics": ["0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67"], "fromBlock": hex(latest - 3000), "toBlock": "latest"}])
print("DOLZ pool swaps last 3000 blocks", len(sw or []), err)
eth = "0x45dda9cb7c25131df268515131f647d726f50608"
sw, err = rpc("eth_getLogs", [{"address": eth, "topics": ["0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67"], "fromBlock": hex(latest - 300), "toBlock": "latest"}])
print("ETH pool swaps last 300 blocks", len(sw or []), err)
# old block range swaps
sw, err = rpc("eth_getLogs", [{"address": pool, "topics": ["0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67"], "fromBlock": hex(80_000_000), "toBlock": hex(80_003_000)}])
print("DOLZ pool swaps old 3000 blocks", len(sw or []), err)
# blockTimestamp field present in logs?
w = "0xa4cd3de07dafa3f700c908043118b39547190143"
lg, err = rpc("eth_getLogs", [{"fromBlock": hex(latest - 20000), "toBlock": "latest", "topics": ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", None, "0x" + "0" * 24 + w[2:]]}])
print("log keys", list((lg or [{}])[0].keys()))
