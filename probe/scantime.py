# One-off measurement: how long listing-event reads take for 1 h, 30 days and the whole USDC era, and how many live USDC listings there are.
import urllib.request, json, time
from hashlib import sha3_256
LM = "0x3d7a352796a8c0d8bbd6b2c3cb95f129e94a763d"; NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "pycryptodome"], check=False)
import site; sys.path.append(site.getusersitepackages())
from Crypto.Hash import keccak
def k(t): h = keccak.new(digest_bits=256); h.update(t.encode()); return "0x" + h.hexdigest()
TL, TU, TC = k("Listed(address,address,uint256,uint256,address,uint256,uint256)"), k("ListingUpdated(address,address,uint256,uint256,address,uint256,uint256)"), k("ListingCancelled(address,address,uint256)")
URL = "https://rpc-mainnet.matic.quiknode.pro"
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"}), timeout=60).read())
    if "error" in r: raise RuntimeError(r["error"])
    return r["result"]
def logs(a, b):
    try:
        return rpc("eth_getLogs", [{"address": LM, "topics": [[TL, TU, TC], None, "0x" + NFT[2:].rjust(64, "0")], "fromBlock": hex(a), "toBlock": hex(b)}])
    except Exception:
        if b - a < 10000: raise
        out = []; step = 50000 if b - a >= 50000 else 9500
        for s in range(a, b + 1, step): out += logs(s, min(b, s + step - 1))
        return out
latest = int(rpc("eth_blockNumber", []), 16)
for label, back in [("1 h", 1800), ("30 d", 30 * 43200), ("60 d", 60 * 43200), ("180 d", 180 * 43200)]:
    t = time.time(); ev = logs(latest - back, latest); dt = time.time() - t
    cur = {}
    for e in sorted(ev, key=lambda e: (int(e["blockNumber"], 16), int(e["logIndex"], 16))):
        tid = int(e["topics"][3], 16)
        if e["topics"][0] == TC: cur.pop(tid, None)
        else: cur[tid] = e
    usdc = [e for e in cur.values() if ("0x" + e["data"][2:][64 + 24:128]).lower() == USDC]
    oldest = min((int(e["blockNumber"], 16) for e in usdc), default=latest)
    print(f"{label}: {len(ev)} events in {dt:.1f} s, live listings {len(cur)}, USDC {len(usdc)}, oldest USDC listing {(latest - oldest) / 43200:.1f} days ago")
