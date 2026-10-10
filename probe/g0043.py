# One-off check: live USDC listings of card g0043 (token ids ~38500-40500) and why the floor misses Limited.
import urllib.request, json, time
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=90).read())
    if "error" in r: print("ERR", m, r["error"])
    return r.get("result")
LM = "0x3d7a352796a8c0d8bbd6b2c3cb95f129e94a763d"; NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
L = "0x1a307eec6f4d6a39564cf4a9082eae46b0bd15123729d84cc35630db1e647714"; U = "0x2602604b81e03c94fa3abf600960a52d6d7457645d7783fcb21b0f4eed9dd62b"; C = "0xe1bfe61cb157e0896411ccf9a5c40e4c346f7bb6e1d2a44de4a724f0cb5c6fb0"
latest = int(rpc("eth_blockNumber", []), 16)
logs = []
start = latest - 120 * 43200
for s in range(start, latest + 1, 500_000):
    logs += rpc("eth_getLogs", [{"address": LM, "topics": [[L, U, C], None, "0x" + NFT[2:].rjust(64, "0")], "fromBlock": hex(s), "toBlock": hex(min(latest, s + 499_999))}]) or []
print("events", len(logs), "oldest block", min(int(l["blockNumber"], 16) for l in logs), "latest", latest)
logs.sort(key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16)))
cur = {}
for l in logs:
    t = int(l["topics"][3], 16)
    if not 38000 <= t <= 41000: continue
    if l["topics"][0] == C: cur.pop(t, None); continue
    d = bytes.fromhex(l["data"][2:])
    cur[t] = dict(seller="0x" + l["topics"][1][-40:], price=int.from_bytes(d[0:32], "big"), cur="0x" + d[44:64].hex(), exp=int.from_bytes(d[64:96], "big"), age_days=round((latest - int(l["blockNumber"], 16)) / 43200, 1))
print("live listings in id range", len(cur))
now = time.time()
for t, x in sorted(cur.items(), key=lambda kv: kv[1]["price"]):
    try:
        j = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://cardsdata.dolz.io/jsons/{t}.json", headers={"user-agent": "Mozilla/5.0"}), timeout=20).read())
    except Exception as e:
        print(t, "json fail", e); continue
    a = {q["trait_type"]: q["value"] for q in j.get("attributes", [])}
    if a.get("Card Number") != "g0043": continue
    owner = "0x" + rpc("eth_call", [{"to": NFT, "data": "0x6352211e" + hex(t)[2:].rjust(64, "0")}, "latest"])[-40:]
    print(t, a.get("Rarity"), a.get("Serial Number"), "price", x["price"], "cur", x["cur"][-6:], "exp", "none" if not x["exp"] else round((x["exp"] - now) / 86400, 1), "age", x["age_days"], "owner==seller", owner == x["seller"])
