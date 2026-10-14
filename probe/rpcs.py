# One-off check: which public Polygon RPCs answer blockNumber, getLogs, eth_call with block overrides, sendRawTransaction.
import urllib.request, json, time
URLS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org", "https://polygon-rpc.com",
        "https://1rpc.io/matic", "https://polygon.llamarpc.com", "https://polygon-pokt.nodies.app", "https://polygon.meowrpc.com",
        "https://rpc.ankr.com/polygon", "https://polygon-mainnet.public.blastapi.io", "https://polygon.blockpi.network/v1/rpc/public",
        "https://endpoints.omniatech.io/v1/matic/mainnet/public", "https://polygon.api.onfinality.io/public", "https://rpc-mainnet.matic.quiknode.pro",
        "https://polygon-public.nodies.app", "https://polygon.rpc.subquery.network/public", "https://rpc.therpc.io/polygon"]
def call(url, m, p):
    t = time.time()
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"}), timeout=15).read())
        ok = "result" in r
        return ok, (str(r.get("result"))[:20] if ok else str(r.get("error"))[:70]), round(time.time() - t, 2)
    except Exception as e:
        return False, repr(e)[:70], round(time.time() - t, 2)
S = "0x6390e6cd5ca7b3be4ba7b97e936f5d596ec2f3b4"
for url in URLS:
    ok, bn, dt = call(url, "eth_blockNumber", [])
    if not ok:
        print(f"{url}: blockNumber FAIL {bn} ({dt}s)"); continue
    latest = int(bn, 16)
    logs = call(url, "eth_getLogs", [{"address": "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc", "fromBlock": hex(latest - 1000), "toBlock": hex(latest)}])
    over = call(url, "eth_call", [{"from": "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6", "to": S, "data": "0xf53a261d" + "1".rjust(64, "0") + hex(10_000_000)[2:].rjust(64, "0")}, "latest", {}, {"time": hex(1791982805)}])
    raw = call(url, "eth_sendRawTransaction", ["0x02"])
    print(f"{url}: block {dt}s | getLogs {logs[0]} {logs[1][:40]} | override {over[1][:60]} | sendRaw {raw[1][:50]}")
