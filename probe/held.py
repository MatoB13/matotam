# One-off check: does the dashboard's chain query (Tenderly getLogs from block 70M) see the new prize cards, and how fast?
import urllib.request, json, time
W = "0xa4cd3de07dafa3f700c908043118b39547190143"
CONTRACTS = ["0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc", "0x1763bfe8c14f0cc3f7f462a9e19e57578f334dc3", "0x7906fddf30af0d1379ab7ec8feb2fb539e30196b"]
T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
def rpc(url, m, p):
    t = time.time()
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read())
    except Exception as e:
        return None, f"EXC {e}", time.time() - t
    return r.get("result"), r.get("error"), time.time() - t
topic = "0x" + "0" * 24 + W[2:]
for url in ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]:
    for name, topics in [("in", [T, None, topic]), ("out", [T, topic])]:
        res, err, dt = rpc(url, "eth_getLogs", [{"address": CONTRACTS, "fromBlock": hex(70_000_000), "toBlock": "latest", "topics": topics}])
        ids = [int(l["topics"][3], 16) for l in (res or []) if len(l["topics"]) == 4]
        print(url[8:30], name, "n", len(res or []), "err", str(err)[:120], f"{dt:.1f}s", "has new", [i for i in (105489, 105892, 105428, 105747) if i in ids], "max block", max((int(l["blockNumber"], 16) for l in res or []), default=None))
