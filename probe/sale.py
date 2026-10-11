# One-off research: how buyers interacted with the g0201 sale contract (16 Sep 2026, 13:00 UTC).
import urllib.request, json, collections, datetime
def rpc(m, p):
    for _ in range(3):
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=120).read())
            if "error" in r: print("ERR", m, r["error"]); return None
            return r.get("result")
        except Exception as e: print("retry", e)
S = "0x56b199b39bfa1d6fff8c363a7116ee34274a747e"
print("code size", (len(rpc("eth_getCode", [S, "latest"])) - 2) // 2)
for name, sel in [("owner", "0x8da5cb5b"), ("token", "0xfc0c546a"), ("paused", "0x5c975abb"), ("price", "0xa035b1fe"), ("maxPerWallet", "0x453c2310"), ("startTime", "0x78e97925"), ("totalSupply", "0x18160ddd")]:
    print(name, rpc("eth_call", [{"to": S, "data": sel}, "latest"]))
logs = rpc("eth_getLogs", [{"address": S, "fromBlock": hex(93_800_000), "toBlock": hex(93_960_000)}]) or []
print("contract logs", len(logs), collections.Counter(l["topics"][0] for l in logs).most_common(8))
for l in logs[:4] + logs[-3:]:
    print(" ", int(l["blockNumber"], 16), l["topics"], l["data"][:300])
# transactions to the contract in the blocks around the burst
start = 93905700
senders, sels, statuses = collections.Counter(), collections.Counter(), collections.Counter()
first = None
for b in range(start, start + 25):
    blk = rpc("eth_getBlockByNumber", [hex(b), True])
    ts = int(blk["timestamp"], 16)
    to_s = [t for t in blk["transactions"] if (t["to"] or "").lower() == S]
    if to_s and first is None: first = b
    if to_s:
        prios = []
        for t in to_s:
            rc = rpc("eth_getTransactionReceipt", [t["hash"]])
            senders[t["from"]] += 1; sels[t["input"][:10]] += 1; statuses[rc["status"]] += 1
            prios.append((int(t.get("maxPriorityFeePerGas", t["gasPrice"]), 16) // 10**9, int(t["transactionIndex"], 16), rc["status"][-1]))
        print(b, datetime.datetime.utcfromtimestamp(ts), "txs to sale", len(to_s), "prio/idx/ok:", sorted(prios, reverse=True)[:12])
print("first block with sale txs", first, "senders", len(senders), "top", senders.most_common(5), "selectors", sels.most_common(5), "status", statuses)
if first:
    blk = rpc("eth_getBlockByNumber", [hex(first), True])
    for t in [t for t in blk["transactions"] if (t["to"] or "").lower() == S][:3]:
        print("sample input", t["from"], t["input"][:400], "value", int(t["value"], 16))
        rc = rpc("eth_getTransactionReceipt", [t["hash"]])
        for l in rc["logs"]: print("   log", l["address"], l["topics"][:3], l["data"][:200])
# what happened in the 30 blocks before the first buy: any tx from DOLZ to the contract (opening)?
for b in range(start - 40, start):
    blk = rpc("eth_getBlockByNumber", [hex(b), True])
    for t in blk["transactions"]:
        if (t["to"] or "").lower() == S: print("pre", b, t["from"], t["input"][:200])
