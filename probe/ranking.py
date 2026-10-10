# One-off check: does the portfolio's ranking logic work on the old DOLZ auction?
import urllib.request, json
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=90).read())
    if "error" in r: print("ERR", m, r["error"])
    return r.get("result")
C = "0x578577c82b35ff6f4a2039b644c7bcd940e8e726"
BC = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"; BU = "0x9b7e56711beda201832eff9ed57917c56e56ed23e585fb7129e05e0111ee51b1"
logs = rpc("eth_getLogs", [{"address": C, "topics": [[BC, BU]], "fromBlock": hex(70_000_000), "toBlock": "latest"}])
print("bid logs", None if logs is None else len(logs))
# all topics the contract emits
alls = rpc("eth_getLogs", [{"address": C, "fromBlock": hex(70_000_000), "toBlock": "latest"}]) or []
from collections import Counter
print("topics", Counter(l["topics"][0] for l in alls).most_common(12))
for l in alls[:3] + [l for l in alls if "a4cd3de07dafa3f700c908043118b39547190143" in l["data"]][:6]:
    print(l["topics"], [l["data"][2:][i:i+64] for i in range(0, len(l["data"]) - 2, 64)])
if logs:
    bids = {}
    for l in sorted(logs, key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16))):
        w = [l["data"][2:][i:i+64] for i in range(0, len(l["data"]) - 2, 64)]
        bids[int(w[3], 16)] = (int(w[1], 16), int(w[2], 16), int(w[4], 16), w[0][-40:])
    by = {}
    for i, b in bids.items(): by.setdefault(b[2], []).append((b[0], b[1], i, b[3]))
    for r, lst in sorted(by.items()):
        lst.sort(key=lambda x: (-x[0], x[1], x[2]))
        print("rarity", r, "count", len(lst), [(n + 1, x[0] / 1e18) for n, x in enumerate(lst) if x[3] == "a4cd3de07dafa3f700c908043118b39547190143"])
