# One-off research of the DOLZ auction contract (public chain data only).
import json, urllib.request, re, collections
A = "0x9e8c5bb7a649a77e80E04300916cD85f3304bb69".lower()
RPC = "https://polygon.gateway.tenderly.co"
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36", "accept": "*/*"}
def http(url, data=None, timeout=25):
    try:
        req = urllib.request.Request(url, data=data, headers={**UA, **({"content-type": "application/json"} if data else {})})
        return urllib.request.urlopen(req, timeout=timeout).read()
    except Exception as e:
        print("ERR", url[:90], e); return b""
def rpc(method, params):
    r = http(RPC, json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode())
    try: return json.loads(r).get("result")
    except Exception: print("rpc bad", r[:200]); return None
print("== blockscout once:", http("https://polygon.blockscout.com/api/v2/smart-contracts/" + A)[:300])
code = rpc("eth_getCode", [A, "latest"]) or "0x"
print("== code bytes", len(code) // 2)
# EIP-1967 implementation slot
impl = rpc("eth_getStorageAt", [A, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"])
print("== impl slot", impl)
sels = sorted(set(re.findall(r"63([0-9a-f]{8})", code[2:])))
print("== PUSH4 selectors in code", len(sels), sels[:120])
latest = int(rpc("eth_blockNumber", []), 16)
logs = []
for start in range(latest - 400_000, latest + 1, 50_000):
    r = rpc("eth_getLogs", [{"address": A, "fromBlock": hex(start), "toBlock": hex(min(latest, start + 49_999))}])
    logs += r or []
print("== logs in last 400k blocks", len(logs))
c = collections.Counter(l["topics"][0] for l in logs)
print(c.most_common())
seen = set()
for l in logs[-200:]:
    k = l["topics"][0]
    if k in seen: continue
    seen.add(k)
    print("LOG", int(l["blockNumber"], 16), l["topics"], l["data"][:400], l["transactionHash"])
hashes = list(dict.fromkeys(l["transactionHash"] for l in logs[-60:]))
methods = collections.Counter()
for h in hashes[-25:]:
    tx = rpc("eth_getTransactionByHash", [h]) or {}
    inp = tx.get("input", "")
    methods[inp[:10]] += 1
    print("TX", h, tx.get("from"), inp[:10], inp[10:330], int(tx.get("value", "0x0"), 16))
print("== methods", methods.most_common())
for sel in set(list(methods) + sels[:80]):
    r = http(f"https://api.4byte.sourcify.dev/signature-database/v1/lookup?function={sel if sel.startswith('0x') else '0x'+sel}")
    try:
        d = json.loads(r)["result"]["function"]
        names = [x["name"] for v in d.values() for x in (v or [])]
        if names: print("SIG", sel, names[:3])
    except Exception: pass
for t in set(c):
    r = http(f"https://api.4byte.sourcify.dev/signature-database/v1/lookup?event={t}")
    try:
        d = json.loads(r)["result"]["event"]
        print("EVT", t, [x["name"] for v in d.values() for x in (v or [])][:3])
    except Exception: pass
html = http("https://dolz.io/auction/0x9e8c5bb7a649a77e80E04300916cD85f3304bb69").decode("utf8", "ignore")
print("== dolz.io html", len(html))
print(sorted(set(re.findall(r"https?://[a-zA-Z0-9.\-]*dolz[a-zA-Z0-9.\-/_]*", html)))[:60])
for m in re.findall(r'src="(/_next/static/[^"]+\.js)"', html)[:40]:
    js = http("https://dolz.io" + m).decode("utf8", "ignore")
    for u in sorted(set(re.findall(r'["\'`](https?://[^"\'`]*(?:api|graphql)[^"\'`]*)["\'`]', js)))[:20]:
        print("JSURL", m[-40:], u)
    for u in sorted(set(re.findall(r'["\'`](/api/[^"\'`]{3,80})["\'`]', js)))[:30]:
        print("JSPATH", m[-40:], u)
