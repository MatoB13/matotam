# One-off research: how winners receive their cards after a DOLZ auction (public chain data only).
import json, urllib.request, collections, time, re
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"]
CUR = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
CREATED = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"
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
def selectors(code):
    b = bytes.fromhex(code[2:]); out = []; i = 0
    while i < len(b):
        op = b[i]
        if op == 0x63: out.append(b[i+1:i+5].hex())
        i += 1 + (op - 0x5f if 0x60 <= op <= 0x7f else 0)
    return sorted(set(out))
def name(sel):
    for url in [f"https://www.4byte.directory/api/v1/signatures/?hex_signature=0x{sel}", f"https://api.openchain.xyz/signature-database/v1/lookup?function=0x{sel}"]:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=20).read())
            if "results" in r and r["results"]: return " / ".join(x["text_signature"] for x in r["results"][:3])
            if r.get("result", {}).get("function", {}).get(f"0x{sel}"): return " / ".join(x["name"] for x in r["result"]["function"][f"0x{sel}"][:3])
        except Exception as e:
            pass
    return "?"
code = rpc("eth_getCode", [CUR, "latest"])
print("code bytes", len(code)//2)
for s in selectors(code): print("SEL", s, name(s))
# Past auction contracts: which logs and tx inputs happened after the end.
latest = int(rpc("eth_blockNumber", []), 16)
contracts = set()
for start in range(latest - 9_000_000, latest + 1, 500_000):
    try:
        for l in rpc("eth_getLogs", [{"fromBlock": hex(start), "toBlock": hex(min(latest, start + 499_999)), "topics": [[CREATED]]}]): contracts.add(l["address"].lower())
    except Exception as e: print("chunk failed", e)
print("contracts", contracts)
for c in sorted(contracts - {CUR}):
    raw = bytes.fromhex(rpc("eth_call", [{"to": c, "data": "0x30337c70"}, "latest"])[2:])
    w = [int.from_bytes(raw[i:i + 32], "big") for i in range(0, len(raw), 32)]
    arr = lambda k: w[1 + w[1 + k] // 32 + 1: 1 + w[1 + k] // 32 + 1 + w[1 + w[1 + k] // 32]]
    end = max(arr(2)); print("\n#####", c, "ends", time.strftime('%m-%d %H:%M', time.gmtime(end)))
    # find block at end via binary search
    lo, hi = latest - 9_000_000, latest
    while lo < hi:
        mid = (lo + hi) // 2
        if int(rpc("eth_getBlockByNumber", [hex(mid), False])["timestamp"], 16) < end: lo = mid + 1
        else: hi = mid
    topics = collections.Counter(); sels = collections.Counter(); senders = collections.Counter(); seen = set(); nft_logs = 0
    for start in range(lo, min(latest, lo + 2_000_000), 9_000):
        try: logs = rpc("eth_getLogs", [{"fromBlock": hex(start), "toBlock": hex(start + 8_999), "address": c}])
        except Exception as e: print("fail", e); continue
        for l in logs:
            topics[l["topics"][0]] += 1
            if l["transactionHash"] in seen or len(seen) > 40: continue
            seen.add(l["transactionHash"])
            tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
            sels[(tx["to"], tx["input"][:10])] += 1; senders[tx["from"]] += 1
            if len(seen) <= 3: print("  sample tx", l["transactionHash"], tx["from"], tx["to"], tx["input"][:200], "topics", l["topics"], l["data"][:300])
        if sum(topics.values()) > 300: break
    print("  topics", dict(topics)); print("  tx (to, selector)", dict(sels)); print("  senders", senders.most_common(8))
