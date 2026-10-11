# One-off research: can a sale purchase be simulated before the start (eth_call with block time override)?
import urllib.request, json
def rpc(url, m, p):
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read())
        return r.get("result", r.get("error"))
    except Exception as e:
        return repr(e)
S = "0x56b199b39bfa1d6fff8c363a7116ee34274a747e"
tx = rpc("https://polygon.gateway.tenderly.co", "eth_getTransactionByHash", [None]) if False else None
# a real public buy from block 93905714
blk = rpc("https://polygon.gateway.tenderly.co", "eth_getBlockByNumber", [hex(93905714), True])
buy = next(t for t in blk["transactions"] if (t["to"] or "").lower() == S)
call = {"from": buy["from"], "to": S, "data": buy["input"], "gas": hex(1_500_000)}
pre = hex(93905690)  # ~30 s before the sale opened
print("pre block ts", int(rpc("https://polygon.gateway.tenderly.co", "eth_getBlockByNumber", [pre, False])["timestamp"], 16), "start 1789563600")
for url in ["https://polygon.gateway.tenderly.co"]:
    print("\n", url)
    print("  plain at pre-start block:", str(rpc(url, "eth_call", [call, pre]))[:200])
    print("  with blockOverrides time=start+1:", str(rpc(url, "eth_call", [call, pre, {}, {"time": hex(1789563601)}]))[:200])
    print("  estimateGas plain:", str(rpc(url, "eth_estimateGas", [call, pre]))[:200])
    print("  estimateGas with override:", str(rpc(url, "eth_estimateGas", [call, pre, {}, {"time": hex(1789563601)}]))[:200])
    print("  debug_traceCall-free check, latest (sale over):", str(rpc(url, "eth_call", [call, "latest"]))[:200])
print("buyer input", buy["input"])
