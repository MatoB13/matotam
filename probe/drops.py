# One-off research: past DOLZ direct sales ("drops") - bursts of DolzNFT mints to many buyers.
import urllib.request, json, collections
def rpc(m, p):
    for _ in range(3):
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=120).read())
            if "error" in r: print("ERR", m, r["error"]); return None
            return r.get("result")
        except Exception as e:
            print("retry", m, e)
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; Z = "0x" + "0" * 64
latest = int(rpc("eth_blockNumber", []), 16)
logs = []
for s in range(latest - 200 * 43200, latest + 1, 250_000):
    logs += rpc("eth_getLogs", [{"address": NFT, "topics": [T, Z], "fromBlock": hex(s), "toBlock": hex(min(latest, s + 249_999))}]) or []
print("mints", len(logs))
by_block = collections.defaultdict(list)
for l in logs: by_block[int(l["blockNumber"], 16)].append(l)
blocks = sorted(by_block)
# clusters: consecutive mint blocks within 150 blocks (~5 min)
clusters, cur = [], []
for b in blocks:
    if cur and b - cur[-1] > 150: clusters.append(cur); cur = []
    cur.append(b)
if cur: clusters.append(cur)
def info(c):
    ls = [l for b in c for l in by_block[b]]
    return len(ls), len({l["topics"][2] for l in ls}), len({l["transactionHash"] for l in ls})
big = [c for c in clusters if info(c)[1] >= 40]
print("clusters with >=40 distinct receivers:", len(big))
for c in big:
    n, recv, txs = info(c)
    ts = rpc("eth_getBlockByNumber", [hex(c[0]), False])["timestamp"]
    import datetime
    print(f"\nCLUSTER blocks {c[0]}..{c[-1]} ({c[-1]-c[0]} blocks) start {datetime.datetime.utcfromtimestamp(int(ts,16))} mints {n} receivers {recv} txs {txs}")
    ls = [l for b in c for l in by_block[b]]
    per_block = collections.Counter(int(l["blockNumber"], 16) - c[0] for l in ls)
    print("  mints per block offset (first 20):", sorted(per_block.items())[:20])
    per_recv = collections.Counter(l["topics"][2] for l in ls)
    print("  mints per receiver distribution:", collections.Counter(per_recv.values()).most_common(8))
for c in big[-3:]:
    print(f"\nDETAIL cluster {c[0]}")
    ls = [l for b in c for l in by_block[b]]
    hashes = list(dict.fromkeys(l["transactionHash"] for l in ls))
    sels, tos, froms = collections.Counter(), collections.Counter(), collections.Counter()
    sample = hashes[:12] + hashes[len(hashes)//2:len(hashes)//2+4] + hashes[-4:]
    for h in hashes[:80]:
        tx = rpc("eth_getTransactionByHash", [h])
        sels[tx["input"][:10]] += 1; tos[tx["to"]] += 1; froms[tx["from"]] += 1
    print("  tx.to:", tos.most_common(5)); print("  selectors:", sels.most_common(5)); print("  distinct senders in first 80:", len(froms), froms.most_common(3))
    for h in sample:
        tx = rpc("eth_getTransactionByHash", [h]); rc = rpc("eth_getTransactionReceipt", [h])
        nm = sum(1 for l in rc["logs"] if l["address"] == NFT and l["topics"][0] == T and l["topics"][1] == Z)
        pays = [(l["address"][-6:], int(l["data"], 16) if l["data"] != "0x" else 0, "0x" + l["topics"][2][-40:]) for l in rc["logs"] if l["topics"][0] == T and l["address"] != NFT]
        print(f"  blk+{int(tx['blockNumber'],16)-c[0]} idx {int(tx['transactionIndex'],16)} from {tx['from'][:10]} to {tx['to']} sel {tx['input'][:10]} len {len(tx['input'])} type {tx.get('type')} prio {int(tx.get('maxPriorityFeePerGas','0x0'),16)/1e9:.0f} max {int(tx.get('maxFeePerGas', tx['gasPrice']),16)/1e9:.0f} gwei status {rc['status']} gasUsed {int(rc['gasUsed'],16)} mints {nm} pays {pays[:3]}")
    # what happened on the sale contract just before the first mint (opening tx?)
    sale = tos.most_common(1)[0][0]
    pre = rpc("eth_getLogs", [{"address": sale, "fromBlock": hex(c[0] - 3000), "toBlock": hex(c[0])}]) or []
    print("  sale contract logs in 3000 blocks before first mint:", len(pre), collections.Counter(l["topics"][0] for l in pre).most_common(5))
    for l in pre[-5:]:
        tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
        print("   pre", int(l["blockNumber"], 16) - c[0], tx["from"][:10], tx["input"][:10], l["topics"][0][:12], l["data"][:200])
    # failed txs to the sale contract in the first block: look at the whole first 3 blocks
    for off in range(0, 3):
        blk = rpc("eth_getBlockByNumber", [hex(c[0] + off), True])
        to_sale = [t for t in blk["transactions"] if (t["to"] or "").lower() == sale.lower()]
        print(f"  block +{off}: {len(blk['transactions'])} txs, {len(to_sale)} to sale contract, prio gwei of those:", sorted(int(t.get('maxPriorityFeePerGas','0x0'),16)//10**9 for t in to_sale)[-10:])
