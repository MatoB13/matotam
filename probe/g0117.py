# One-off check: live market listings of g0117 (tokens ~49060-49700) read per token on chain, with the block each was listed in.
import urllib.request, json, time, sys, subprocess, site
from concurrent.futures import ThreadPoolExecutor
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "pycryptodome"], check=False); sys.path.append(site.getusersitepackages())
from Crypto.Hash import keccak
def k(t): h = keccak.new(digest_bits=256); h.update(t.encode()); return h.hexdigest()
SEL = k("getListing(address,uint256)")[:8]; OWN = k("ownerOf(uint256)")[:8]
NFT = "d27029e4ebc3c4c55fcfadddc54fa0b911829afc"; PS = "0xff1162ede44d5fd3ef893314b022855a8c1c0ae8"; LM = "0x3d7a352796a8c0d8bbd6b2c3cb95f129e94a763d"
URL = "https://rpc-mainnet.matic.quiknode.pro"
def rpc(m, p):
    for _ in range(3):
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json"}), timeout=20).read())
            if "result" in r: return r["result"]
        except Exception: time.sleep(1)
def listing(t):
    raw = rpc("eth_call", [{"to": PS, "data": "0x" + SEL + NFT.rjust(64, "0") + hex(t)[2:].rjust(64, "0")}, "latest"]) or "0x"
    d = bytes.fromhex(raw[2:])
    if len(d) < 192: return None
    seller = "0x" + d[12:32].hex(); price = int.from_bytes(d[96:128], "big"); cur = "0x" + d[140:160].hex(); exp = int.from_bytes(d[160:192], "big")
    if price == 0 or seller == "0x" + "00" * 20: return None
    owner = "0x" + (rpc("eth_call", [{"to": "0x" + NFT, "data": "0x" + OWN + hex(t)[2:].rjust(64, "0")}, "latest"]) or "0x" + "0" * 64)[-40:]
    return {"t": t, "seller": seller, "price": price / 1e6 if cur.endswith("3359") else price / 1e18, "cur": cur[-4:], "exp": exp, "owned": owner == seller}
with ThreadPoolExecutor(12) as pool:
    found = [x for x in pool.map(listing, range(49060, 49700)) if x]
live = sorted([x for x in found if x["owned"] and (not x["exp"] or x["exp"] > time.time())], key=lambda x: x["price"])
print("listed", len(found), "live", len(live))
for x in live[:12]:
    # when was it listed? last Listed/Updated event for this token
    logs = rpc("eth_getLogs", [{"address": LM, "fromBlock": hex(80_000_000), "toBlock": "latest", "topics": [None, None, "0x" + NFT.rjust(64, "0"), "0x" + hex(x["t"])[2:].rjust(64, "0")]}]) or []
    blocks = [int(l["blockNumber"], 16) for l in logs]
    print(x, "events", len(logs), "last block", max(blocks) if blocks else None)
