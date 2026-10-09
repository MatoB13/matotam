# One-off research: when were prizes of past DOLZ auctions withdrawn, and by whom (the winner or DOLZ)?
import urllib.request, json, collections, time
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=40).read())
            if "result" in r: return r["result"]
        except Exception: pass
CREATED = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"
OWNER = "0xd94298c2160ad8603216a3fa7a233ec609b2494d"
latest = int(rpc("eth_blockNumber", []), 16)
contracts = set()
for start in range(latest - 12_000_000, latest + 1, 500_000):
    for l in rpc("eth_getLogs", [{"fromBlock": hex(start), "toBlock": hex(min(latest, start + 499_999)), "topics": [[CREATED]]}]) or []:
        contracts.add(l["address"].lower())
print("auctions", contracts)
bt = {}
def ts(block):
    if block not in bt: bt[block] = int(rpc("eth_getBlockByNumber", [hex(block), False])["timestamp"], 16)
    return bt[block]
for c in sorted(contracts):
    raw = bytes.fromhex(rpc("eth_call", [{"to": c, "data": "0x30337c70"}, "latest"])[2:])
    w = [int.from_bytes(raw[i:i + 32], "big") for i in range(0, len(raw), 32)]
    arr = lambda k: w[1 + w[1 + k] // 32 + 1: 1 + w[1 + k] // 32 + 1 + w[1 + w[1 + k] // 32]]
    end = max(arr(2))
    print(f"\n##### {c} last rarity ends {time.strftime('%Y-%m-%d %H:%M', time.gmtime(end))} UTC")
    logs = []
    for start in range(latest - 12_000_000, latest + 1, 500_000):
        logs += rpc("eth_getLogs", [{"address": c, "fromBlock": hex(start), "toBlock": hex(min(latest, start + 499_999))}]) or []
    other = [l for l in logs if l["topics"][0][:10] not in ("0x7a05ac1b", "0x9b7e5671")]
    by_topic = collections.defaultdict(list)
    for l in other: by_topic[l["topics"][0]].append(l)
    for topic, ls in by_topic.items():
        try: hours = sorted((ts(int(l["blockNumber"], 16)) - end) / 3600 for l in ls[:400])
        except Exception: print("  ts fail", topic[:10]); continue
        print(f"  topic {topic[:10]} count {len(ls)} hours after end: first {hours[0]:.1f} median {hours[len(hours)//2]:.1f} last {hours[-1]:.1f}")
        senders = collections.Counter()
        for l in ls[:25]:
            tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
            if not tx: continue
            senders[("OWNER" if tx["from"].lower() == OWNER else "other", tx["input"][:10])] += 1
        print("    senders (first 25):", dict(senders), "sample data", ls[0]["data"][:200], ls[0]["topics"][1:])
