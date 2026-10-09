# One-off research: why the sniper's auction ranking (from chain events) differed from dolz.io's.
import urllib.request, json, collections
UA = {"user-agent": "Mozilla/5.0 Chrome/126", "origin": "https://dolz.io", "referer": "https://dolz.io/", "content-type": "application/json"}
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"; HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read())
            if "result" in r: return r["result"]
            print("err", r.get("error"))
        except Exception as e: print("ex", e)
def post(b): return json.loads(urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(b).encode(), headers=UA), timeout=60).read())
backend = post({"command": "getContractBids", "contractAddress": C})
ev = post({"command": "getBidEvents", "contractAddress": C})
print("backend bids", len(backend), "sample", backend[0]); print("bidEvents", len(ev) if isinstance(ev, list) else ev, (ev[:2] if isinstance(ev, list) else ""))
CR = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"; UP = "0x9b7e56711beda201832eff9ed57917c56e56ed23e585fb7129e05e0111ee51b1"
latest = int(rpc("eth_blockNumber", []), 16)
logs = []
for s in range(latest - 600_000, latest, 50_000):
    logs += rpc("eth_getLogs", [{"address": C, "topics": [[CR, UP]], "fromBlock": hex(s), "toBlock": hex(min(latest, s + 49_999))}]) or []
logs.sort(key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16)))
book = {}
for l in logs:
    d = bytes.fromhex(l["data"][2:]); w = [int.from_bytes(d[i:i + 32], "big") for i in range(0, len(d), 32)]
    b = book.setdefault(w[3], {"bidder": "0x" + d[12:32].hex(), "n": 0, "kinds": []})
    b.update(amount=w[1], ts=w[2], rarity=w[4]); b["n"] += 1; b["kinds"].append(l["topics"][0][:6] + ":" + str(len(w)))
print("chain bids", len(book), "event data words", collections.Counter(len(l["data"]) // 64 for l in logs))
bk = {b["bidId"]: b for b in backend}
diff = collections.Counter()
for bid, b in book.items():
    x = bk.get(bid)
    if not x: diff["missing in backend"] += 1; continue
    if x["value"] != b["amount"]: diff["value differs"] += 1
    if x["rarityId"] != b["rarity"]: diff["rarity differs"] += 1
    if x["bidder"].lower() != b["bidder"]: diff["bidder differs"] += 1
print("diffs", dict(diff))
for bid, b in list(book.items()):
    x = bk.get(bid)
    if x and (x["value"] != b["amount"] or x["rarityId"] != b["rarity"]):
        print("  ex bid", bid, "chain", b, "backend", x); break
for r, sup in [(1, 25), (2, 98), (3, 366)]:
    ch = sorted([b for b in book.values() if b["rarity"] == r], key=lambda b: (-b["amount"], b["ts"]))
    be = sorted([b for b in backend if b["rarityId"] == r], key=lambda b: (-b["value"], b["timestamp"]))
    pc = next((i + 1 for i, b in enumerate(ch) if b["bidder"] == HOT), None); pb = next((i + 1 for i, b in enumerate(be) if b["bidder"].lower() == HOT), None)
    print(f"rarity {r}: chain n={len(ch)} hot pos {pc} cutoff {ch[sup-1]['amount']/1e6 if len(ch)>=sup else None} | backend n={len(be)} hot pos {pb} cutoff {be[sup-1]['value']/1e6 if len(be)>=sup else None}")
    # same-bidder multiple bids in rarity
    cnt = collections.Counter(b["bidder"] for b in ch)
    print("   bidders with several bids:", sum(1 for v in cnt.values() if v > 1), "extra bids", sum(v - 1 for v in cnt.values() if v > 1))
