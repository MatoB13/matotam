# One-off check of the arbitrage top 5: every live USDC listing of these cards on chain, rarity from the dolz.io market API.
import urllib.request, json, time, sys, subprocess, site
from concurrent.futures import ThreadPoolExecutor
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "pycryptodome"], check=False); sys.path.append(site.getusersitepackages())
from Crypto.Hash import keccak
def k(t): h = keccak.new(digest_bits=256); h.update(t.encode()); return h.hexdigest()
SEL = k("getListing(address,uint256)")[:8]; OWN = k("ownerOf(uint256)")[:8]
NFT = "d27029e4ebc3c4c55fcfadddc54fa0b911829afc"; PS = "0xff1162ede44d5fd3ef893314b022855a8c1c0ae8"
URLS = ["https://polygon.drpc.org", "https://polygon.gateway.tenderly.co", "https://rpc-mainnet.matic.quiknode.pro", "https://1rpc.io/matic"]
def call(data, to):
    for i in range(8):
        u = URLS[i % len(URLS)]
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": to, "data": data}, "latest"]}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"}), timeout=15).read())
            if "result" in r: return r["result"]
        except Exception: pass
        time.sleep(0.5)
    raise RuntimeError("rpc")
def listing(t):
    d = bytes.fromhex(call("0x" + SEL + NFT.rjust(64, "0") + hex(t)[2:].rjust(64, "0"), PS)[2:])
    if len(d) < 192: return None
    seller = "0x" + d[12:32].hex(); price = int.from_bytes(d[96:128], "big"); cur = "0x" + d[140:160].hex(); exp = int.from_bytes(d[160:192], "big")
    if not price or not cur.endswith("3359") or (exp and exp < time.time()): return None
    owner = "0x" + call("0x" + OWN + hex(t)[2:].rjust(64, "0"), "0x" + NFT)[-40:]
    return (t, price / 1e6) if owner == seller else None
def rarity(t):
    r = urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/apiMarket.php", data=json.dumps({"command": "getNFTInfos", "contractAddress": "0x" + NFT, "nftId": str(t)}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"}), timeout=20).read()
    tr = json.loads(r)["traits"]; return tr["Card Number"][0], tr["Rarity"][0], tr["Serial Number"][0]
for card, lo, hi in [("g0063", 53800, 54420), ("g0110", 55400, 55900), ("g0029", 1150, 1460), ("g0059", 52700, 53200), ("g0055", 67800, 68300)]:
    with ThreadPoolExecutor(6) as pool:
        live = [x for x in pool.map(listing, range(lo, hi)) if x]
    rows = []
    for t, p in live:
        c, r, s = rarity(t)
        if c == card and r == "Limited": rows.append((p, t, s))
    rows.sort()
    print(card, "live Limited:", len(rows), "cheapest:", rows[:3], flush=True)
