# One-off research: how many withdrawal claims dolz.io publishes for the auction, vs cards sold.
import urllib.request, json
from concurrent.futures import ThreadPoolExecutor
UA = {"user-agent": "Mozilla/5.0 Chrome/126", "origin": "https://dolz.io", "referer": "https://dolz.io/", "content-type": "application/json"}
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"; HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
def post(b):
    for _ in range(3):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(b).encode(), headers=UA), timeout=30).read())
        except Exception: pass
bids = post({"command": "getContractBids", "contractAddress": C})
bidders = sorted({b["bidder"].lower() for b in bids})
with ThreadPoolExecutor(8) as ex: res = dict(ex.map(lambda a: (a, post({"command": "getUserWithdraw", "contractAddress": C, "userAddress": a})), bidders))
entries = [e for r in res.values() for e in (r or [])]
tokens = sum(len(json.loads(e["dawTokenIDs"])) for e in entries)
refunds = sum(int(e["dawRefundAmount"]) for e in entries) / 1e6
print("bidders", len(bidders), "with claim", len(entries), "cards in claims", tokens, "of 489", "refunds total $", refunds)
# who is missing: winners by bid ranking without a claim
ranking = {}
for r, sup in [(0, 5), (1, 25), (2, 98), (3, 366)]:
    rb = sorted([b for b in bids if b["rarityId"] == r], key=lambda b: (-b["value"], b["timestamp"]))
    for b in rb[:sup]: ranking.setdefault(b["bidder"].lower(), 0); ranking[b["bidder"].lower()] += 1
have = {e["dawClaimer"].lower() for e in entries}
missing = [a for a in ranking if a not in have]
print("winners", len(ranking), "winners without claim", len(missing), "hot is winner", HOT in ranking, "hot has claim", HOT in have)
print("sample missing", missing[:8])
# rerun 14:33
# rerun 15:13
