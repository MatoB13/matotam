# One-off check: listing events of two g0117 cards over the whole history (when listed, in which currency), and the dolz.io app's attribute encoder.
import urllib.request, json, time, re
NFT = "d27029e4ebc3c4c55fcfadddc54fa0b911829afc"; LM = "0x3d7a352796a8c0d8bbd6b2c3cb95f129e94a763d"
URL = "https://rpc-mainnet.matic.quiknode.pro"
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json"}), timeout=30).read())
    if "error" in r: raise RuntimeError(r["error"])
    return r["result"]
latest = int(rpc("eth_blockNumber", []), 16)
for t in (49695, 49529):
    out = []
    hi = latest
    while hi > latest - 20_000_000:
        lo = hi - 1_000_000
        try:
            logs = rpc("eth_getLogs", [{"address": LM, "fromBlock": hex(lo), "toBlock": hex(hi), "topics": [None, None, "0x" + NFT.rjust(64, "0"), "0x" + hex(t)[2:].rjust(64, "0")]}])
        except Exception as e:
            print(t, lo, hi, "ERR", str(e)[:120]); logs = []
        for l in logs:
            d = l["data"][2:]
            out.append((int(l["blockNumber"], 16), l["topics"][0][:10], int(d[:64] or "0", 16), d[64 + 24:128][-4:]))
        hi = lo - 1
        if len(out) >= 1 and hi < min(o[0] for o in out) - 3_000_000: break
    print(t, sorted(out))
html = urllib.request.urlopen(urllib.request.Request("https://dolz.io/", headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode()
src = re.findall(r'src="(/static/js/[^"]+\.js)"', html)[0]
body = urllib.request.urlopen(urllib.request.Request("https://dolz.io" + src, headers={"user-agent": "Mozilla/5.0"}), timeout=60).read().decode("utf-8", "replace")
i = body.find('command:"getNFTsForAttributes"')
seg = body[max(0, i - 6000): i]
m = re.search(r'l=n\((\d+)\)', seg) or re.search(r'\bl=([a-zA-Z.()0-9]+)', seg)
print("l def:", m.group(0) if m else None)
if m and m.group(0).startswith("l=n("):
    mod = m.group(1); j = body.find(mod + ":")
    print(body[j: j + 1500])
for mm in list(re.finditer(r'getNFTsForAttributes\)?\(', body))[:0]: pass
k = body.find("attributes:")
calls = [body[x.start() - 400: x.start() + 300] for x in re.finditer(r'status:"listed"|status:"onSale"|"listed"', body)][:3]
for c in calls: print("CALL:", c.replace("\n", " "), "\n")
