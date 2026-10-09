# One-off research: how tightly past DOLZ auctions ended (public chain data only).
import json, urllib.request, collections, time
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"]
CREATED = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"
UPDATED = "0x9b7e56711beda201832eff9ed57917c56e56ed23e585fb7129e05e0111ee51b1"
NAMES = ["Legendary", "Epic", "Rare", "Limited"]
def rpc(method, params, tries=6):
    for i in range(tries):
        url = RPCS[i % len(RPCS)]
        try:
            req = urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"})
            r = json.loads(urllib.request.urlopen(req, timeout=60).read())
            if "error" in r: raise RuntimeError(str(r["error"])[:150])
            return r["result"]
        except Exception as e:
            print("  rpc retry", method, url[:30], e); time.sleep(2 + 2 * i)
    raise RuntimeError("rpc failed")
def settings(contract):
    raw = bytes.fromhex(rpc("eth_call", [{"to": contract, "data": "0x30337c70"}, "latest"])[2:])
    w = [int.from_bytes(raw[i:i + 32], "big") for i in range(0, len(raw), 32)]
    arr = lambda k: w[1 + w[1 + k] // 32 + 1: 1 + w[1 + k] // 32 + 1 + w[1 + w[1 + k] // 32]]
    return {"supply": arr(0), "start": arr(1), "end": arr(2), "min": arr(3)}
latest = int(rpc("eth_blockNumber", []), 16)
logs = []
step = 500_000
for start in range(latest - 9_000_000, latest + 1, step):
    try:
        r = rpc("eth_getLogs", [{"fromBlock": hex(start), "toBlock": hex(min(latest, start + step - 1)), "topics": [[CREATED, UPDATED]]}])
        logs += r
        print("chunk", start, len(r))
    except Exception as e:
        print("chunk failed", start, e)
    time.sleep(1)
by_contract = collections.defaultdict(list)
for l in logs: by_contract[l["address"].lower()].append(l)
print("auction contracts:", {k: len(v) for k, v in by_contract.items()})
for contract, entries in by_contract.items():
    try:
        st = settings(contract)
    except Exception as e:
        print("settings failed", contract, e); continue
    print(f"\n######## {contract}  supplies {st['supply']}  min {[m/1e6 for m in st['min']]}")
    events = []
    for l in sorted(entries, key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16))):
        d = bytes.fromhex(l["data"][2:]); w = [int.from_bytes(d[i:i + 32], "big") for i in range(0, len(d), 32)]
        events.append({"bidder": "0x" + d[12:32].hex(), "amount": w[1], "ts": w[2], "id": w[3], "rarity": w[4]})
    for rarity, supply in enumerate(st["supply"]):
        end = st["end"][rarity]
        if end > time.time(): print(f"  {NAMES[rarity]}: still running, ends {time.strftime('%m-%d %H:%M', time.gmtime(end))}"); continue
        evs = [e for e in events if e["rarity"] == rarity]
        def book_at(t):
            b = {}
            for e in evs:
                if e["ts"] <= t: b[e["id"]] = (e["amount"], e["ts"], e["bidder"])
            return sorted(b.values(), key=lambda x: (-x[0], x[1]))
        def cut(t, k):
            b = book_at(t); return b[k - 1][0] / 1e6 if len(b) >= k else None
        final = book_at(end + 3600)
        late = {s: sum(1 for e in evs if end - s < e["ts"] <= end) for s in (5, 15, 60, 300)}
        print(f"  {NAMES[rarity]} (supply {supply}, {len(final)} bidders, end {time.strftime('%m-%d %H:%M:%S', time.gmtime(end))}) bids in last 5s/15s/60s/5min: {late[5]}/{late[15]}/{late[60]}/{late[300]}")
        for k in (supply - 2, supply - 1, supply, supply + 1):
            if k < 1: continue
            print(f"     place {k:3d}: " + "  ".join(f"T-{lbl}: {cut(end - s, k)}" for lbl, s in (("10m", 600), ("3m", 180), ("60s", 60), ("15s", 15), ("5s", 5), ("0", 0))) + f"  final: {cut(end + 3600, k)}")
        last = [e for e in evs if end - 60 < e["ts"] <= end + 30]
        for e in last[-12:]:
            print(f"       {e['ts'] - end:+4d}s  ${e['amount']/1e6:8.2f}  {e['bidder'][:10]}")
