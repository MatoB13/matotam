# One-off check: when were the live g0117 listings listed (vs the book's start block 94,600,000), and do big getLogs
# ranges return fewer events than small ones (truncation)?
import urllib.request, json, time, sys, subprocess, site
from concurrent.futures import ThreadPoolExecutor
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "pycryptodome"], check=False); sys.path.append(site.getusersitepackages())
from Crypto.Hash import keccak
def k(t): h = keccak.new(digest_bits=256); h.update(t.encode()); return "0x" + h.hexdigest()
NFT = "d27029e4ebc3c4c55fcfadddc54fa0b911829afc"; PS = "0xff1162ede44d5fd3ef893314b022855a8c1c0ae8"; LM = "0x3d7a352796a8c0d8bbd6b2c3cb95f129e94a763d"
TL, TU, TC = k("Listed(address,address,uint256,uint256,address,uint256,uint256)"), k("ListingUpdated(address,address,uint256,uint256,address,uint256,uint256)"), k("ListingCancelled(address,address,uint256)")
SEL = k("getListing(address,uint256)")[2:10]
URLS = {"quiknode": "https://rpc-mainnet.matic.quiknode.pro", "tenderly": "https://polygon.gateway.tenderly.co"}
def rpc(m, p, url=URLS["quiknode"]):
    r = json.loads(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"}), timeout=30).read())
    if "error" in r: raise RuntimeError(str(r["error"])[:150])
    return r["result"]
def listed(t):
    try:
        d = bytes.fromhex(rpc("eth_call", [{"to": PS, "data": "0x" + SEL + NFT.rjust(64, "0") + hex(t)[2:].rjust(64, "0")}, "latest"])[2:])
        return t if len(d) >= 192 and int.from_bytes(d[96:128], "big") else None
    except Exception:
        return None
ids = [49652, 49529, 49695, 49694, 49693, 49692, 49450, 49413, 49690, 49689, 49688, 49687, 49075, 49166, 49291, 49302]
T = URLS["tenderly"]
latest = int(rpc("eth_blockNumber", [], T), 16)
topic3 = ["0x" + hex(t)[2:].rjust(64, "0") for t in ids]
events = {}
for lo in range(90_000_000, latest + 1, 500_000):
    hi = min(latest, lo + 499_999)
    for attempt in range(4):
        try:
            logs = rpc("eth_getLogs", [{"address": LM, "fromBlock": hex(lo), "toBlock": hex(hi), "topics": [[TL, TU, TC], None, "0x" + NFT.rjust(64, "0"), topic3]}], T)
            break
        except Exception as e:
            logs = None; time.sleep(2 + attempt * 2)
    if logs is None:
        print(lo, "FAILED"); continue
    for l in logs:
        t = int(l["topics"][3], 16)
        kind = {TL: "L", TU: "U", TC: "C"}[l["topics"][0]]
        events.setdefault(t, []).append((int(l["blockNumber"], 16), kind, int(l["data"][2:66], 16)))
    time.sleep(0.3)
for t in ids:
    print(t, events.get(t))
# truncation test on the first USDC days, all cards
lo, hi = 94_600_000, 94_799_999
for name, url in []:
    try:
        big = len(rpc("eth_getLogs", [{"address": LM, "fromBlock": hex(lo), "toBlock": hex(hi), "topics": [[TL, TU, TC], None, "0x" + NFT.rjust(64, "0")]}], url))
    except Exception as e:
        big = f"ERR {e}"
    small = 0
    try:
        for s in range(lo, hi + 1, 20_000):
            small += len(rpc("eth_getLogs", [{"address": LM, "fromBlock": hex(s), "toBlock": hex(min(hi, s + 19_999)), "topics": [[TL, TU, TC], None, "0x" + NFT.rjust(64, "0")]}], url))
    except Exception as e:
        small = f"ERR {e}"
    print(name, "200k range:", big, " 10x20k:", small)
