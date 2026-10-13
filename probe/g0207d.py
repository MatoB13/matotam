# One-off check: g0207 public round timing, per-wallet state and the whitelist status of the main wallet.
import urllib.request, json, time, collections
def rpc(m, p):
    for attempt in range(6):
        try:
            time.sleep(0.35)
            r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=90).read())
            return r.get("result", r.get("error"))
        except Exception:
            time.sleep(3 * (attempt + 1))
S = "0x6390e6cd5ca7b3be4ba7b97e936f5d596ec2f3b4"; START = 1791982800
HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"; MAIN = "0xa4cd3de07dafa3f700c908043118b39547190143"
w = lambda n: hex(n)[2:].rjust(64, "0")
def sim(frm, data, t):
    res = rpc("eth_call", [{"from": frm, "to": S, "data": data, "gas": hex(3_000_000)}, "latest", {}, {"time": hex(t)}])
    return ("REVERT " + str(res.get("message"))[:100]) if isinstance(res, dict) else "OK"
for off in (-60, 0, 2, 300, 599, 601, 3600):
    print("public mint hot 1×10e6 at start%+d:" % off, sim(HOT, "0xf53a261d" + w(1) + w(10_000_000), START + off))
print("public 5 at +700:", sim(HOT, "0xf53a261d" + w(5) + w(50_000_000), START + 700))
print("public 6 at +700:", sim(HOT, "0xf53a261d" + w(6) + w(60_000_000), START + 700))
for n, a in (("main", MAIN), ("hot", HOT)):
    print(n, "mintedByUser", rpc("eth_call", [{"to": S, "data": "0x7340d2d2" + w(int(a, 16))}, "latest"]),
          "remainingMints", rpc("eth_call", [{"to": S, "data": "0x64d0764e" + w(int(a, 16))}, "latest"]))
    for sel in ("1004a9ee", "8e304e9c"):
        print("  ", sel, "(addr)", rpc("eth_call", [{"to": S, "data": "0x" + sel + w(int(a, 16))}, "latest"]))
logs = rpc("eth_getLogs", [{"address": S, "fromBlock": hex(95_400_000), "toBlock": "latest"}])
print("contract events:", len(logs) if isinstance(logs, list) else logs, collections.Counter(l["topics"][0][:12] for l in logs) if isinstance(logs, list) else "")
for l in (logs if isinstance(logs, list) else [])[:5]:
    tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
    print("  ", int(l["blockNumber"], 16), l["topics"][:2], l["data"][:200], "from", tx["from"], tx["input"][:10])
