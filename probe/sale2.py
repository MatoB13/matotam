# One-off research: functions of the g0201 sale contract, its presale wave (15 Sep) and its events.
import urllib.request, json, collections, re
def rpc(m, p):
    for _ in range(3):
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=120).read())
            if "error" in r: print("ERR", m, r["error"]); return None
            return r.get("result")
        except Exception as e: print("retry", e)
def sig(sel, kind="function"):
    try:
        url = f"https://www.4byte.directory/api/v1/{'event-' if kind == 'event' else ''}signatures/?hex_signature={sel}"
        j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "x"}), timeout=20).read())
        return [r["text_signature"] for r in j["results"]][:3]
    except Exception as e:
        return repr(e)
S = "0x56b199b39bfa1d6fff8c363a7116ee34274a747e"
code = rpc("eth_getCode", [S, "latest"])[2:]
# PUSH4 (0x63) followed by EQ (0x14) is the dispatcher pattern
sels = sorted(set(re.findall(r"63([0-9a-f]{8})(?=80?14|14)", code)))
print("selectors", len(sels))
for s in sels:
    print(" ", s, sig("0x" + s))
# implementation behind a proxy?
impl = rpc("eth_getStorageAt", [S, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a9fc0c3e2ec8a8f9e1", "latest"])
print("eip1967 impl slot", impl)
for t in ["0xead94eb56e46b064207039af2a77f19bbfdcdf7cb4481d53d8f8c75dfcb59fc4", "0x62cf9c2d7f374ec953585bf0b951aca1991550f9f00f568eff228053db1f2c67"]:
    print("event", t[:10], sig(t, "event"))
logs = rpc("eth_getLogs", [{"address": S, "topics": ["0x62cf9c2d7f374ec953585bf0b951aca1991550f9f00f568eff228053db1f2c67"], "fromBlock": hex(93_000_000), "toBlock": hex(93_960_000)}]) or []
print("62cf events", len(logs), "blocks", logs and (int(logs[0]["blockNumber"], 16), int(logs[-1]["blockNumber"], 16)))
for l in logs[:3]:
    tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
    print("  ", l["topics"], l["data"][:400], "tx from", tx["from"], "sel", tx["input"][:10], "inputlen", len(tx["input"]))
# presale wave of 15 Sep: inputs of first buys
buys = rpc("eth_getLogs", [{"address": S, "topics": ["0xead94eb56e46b064207039af2a77f19bbfdcdf7cb4481d53d8f8c75dfcb59fc4"], "fromBlock": hex(93_840_000), "toBlock": hex(93_900_000)}]) or []
print("15 Sep buys", len(buys), "qty dist", collections.Counter(int(l["data"][66:130], 16) for l in buys))
for l in buys[:3]:
    tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
    print("  presale tx", tx["from"], tx["input"][:10], len(tx["input"]), tx["input"][:600])
blk = rpc("eth_getBlockByNumber", [hex(int(buys[0]["blockNumber"], 16)), False]) if buys else None
if blk: print("presale first buy block time", int(blk["timestamp"], 16))
# how the 16 Sep public sale was gated in time: the first block with a buy vs. reverts just before
for b in range(93905705, 93905713):
    blk = rpc("eth_getBlockByNumber", [hex(b), True])
    to_s = [t for t in blk["transactions"] if (t["to"] or "").lower() == S]
    for t in to_s:
        rc = rpc("eth_getTransactionReceipt", [t["hash"]])
        print("early", b, int(blk["timestamp"], 16), t["from"], t["input"][:10], "status", rc["status"])
print("block 93905713 ts", int(rpc("eth_getBlockByNumber", [hex(93905713), False])["timestamp"], 16))
