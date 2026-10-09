# One-off research of the DOLZ auction contract (public chain data only).
import json, urllib.request, collections, time
A = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
RPC = "https://polygon.gateway.tenderly.co"
HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
MAIN = "0xa4cd3de07dafa3f700c908043118b39547190143"
def rpc(method, params):
    req = urllib.request.Request(RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(), headers={"content-type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=40).read())
    if "error" in r: return "ERROR " + str(r["error"])
    return r["result"]
def call(sel_sig, args=""):
    from hashlib import sha3_256
    return rpc("eth_call", [{"to": A, "data": sel_sig + args}, "latest"])
w = lambda v: format(v, "064x")
aw = lambda a: a.lower()[2:].rjust(64, "0")
views = {"getSaleSettings": "0x30337c70", "getRaritySupplies": "0xe32eec36", "rarityCount": "0xefd10c77", "token": "0xfc0c546a",
         "getNbBids": "0xd42a58df", "getNftAddress": "0xbe9a71bd", "paused": "0x5c975abb", "decimals": "0x313ce567", "supply": "0x047fc9aa",
         "startingTokenId": "0xb4f18d8d", "fundsWithdrawed": "0x6e5b0fc5", "getHashRoot": "0x244cb2c8", "owner": "0x8da5cb5b", "nftEscrow": "0x62b5bdf8",
         "trustedForwarder": "0x7da0a877"}
for name, sel in views.items():
    r = call(sel)
    words = [r[2 + i:2 + i + 64] for i in range(0, len(r) - 2, 64)] if isinstance(r, str) and r.startswith("0x") else r
    print("VIEW", name, [int(x, 16) if isinstance(x, str) and len(x) == 64 and int(x, 16) < 10**20 else x for x in (words if isinstance(words, list) else [words])])
for who in (HOT, MAIN):
    for rarity in (0, 1, 2, 3, 4):
        print("alreadyBidded", who[:8], rarity, call("0x500ae991", aw(who) + w(rarity)), "total", call("0x2ed3dd0e", aw(who) + w(rarity)))
    print("getTotalBiddedPerUser", who[:8], call("0xf5525be9", aw(who)))
latest = int(rpc("eth_blockNumber", []), 16)
print("latest block", latest, "time", int(rpc("eth_getBlockByNumber", ["latest", False])["timestamp"], 16))
CREATED = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"
UPDATED = "0x9b7e56711beda201832eff9ed57917c56e56ed23e585fb7129e05e0111ee51b1"
logs = []
start = latest - 3_000_000
for s in range(start, latest + 1, 200_000):
    r = rpc("eth_getLogs", [{"address": A, "fromBlock": hex(s), "toBlock": hex(min(latest, s + 199_999)), "topics": [[CREATED, UPDATED]]}])
    if isinstance(r, str): print(r); continue
    logs += r
print("bid logs", len(logs), "first block", logs[0]["blockNumber"] if logs else None)
bids = {}
for l in sorted(logs, key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16))):
    d = bytes.fromhex(l["data"][2:])
    words = [int.from_bytes(d[i:i + 32], "big") for i in range(0, len(d), 32)]
    bidder = "0x" + d[12:32].hex()
    amount, ts, bid_id, rarity = words[1], words[2], words[3], words[4]
    b = bids.setdefault(bid_id, {"bidder": bidder, "first": ts})
    b.update(amount=amount, ts=ts, rarity=rarity, kind="U" if l["topics"][0] == UPDATED else "C")
by = collections.defaultdict(list)
for i, b in bids.items(): by[b["rarity"]].append((b["amount"], -b["ts"], i, b["bidder"], b["first"]))
for r, items in sorted(by.items()):
    items.sort(reverse=True)
    print(f"== rarity {r}: {len(items)} bids")
    for pos, (amt, nts, i, who, first) in enumerate(items[:32], 1):
        print(f"  {pos:2d} ${amt/1e6:9.2f} bid#{i} {who} last={time.strftime('%m-%d %H:%M:%S', time.gmtime(-nts))} first={time.strftime('%m-%d %H:%M', time.gmtime(first))}")
# receipts: what moves on a bid and on an updateBid
for h in ["0xbb32ae4a8596986005d16391418e7e07455ff1ac5303e00e9c48b7f045adba32", "0x02338021e41f2adb16a1b8285c7c4d0e1e1d3614de8276a6df45e6b7b99c49c9"]:
    rc = rpc("eth_getTransactionReceipt", [h])
    print("RECEIPT", h[:10], rc.get("status"), rc.get("gasUsed"))
    for lg in rc.get("logs", []):
        print("   ", lg["address"], lg["topics"][:3], lg["data"][:130])
