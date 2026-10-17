# One-off history: hourly floor (cheapest live USDC listing) of g0218, g0211, g0207 from listing events and NFT transfers.
import urllib.request, json, time, sys, subprocess, site
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "pycryptodome"], check=False); sys.path.append(site.getusersitepackages())
from Crypto.Hash import keccak
def k(t): h = keccak.new(digest_bits=256); h.update(t.encode()); return "0x" + h.hexdigest()
TL, TU, TC = k("Listed(address,address,uint256,uint256,address,uint256,uint256)"), k("ListingUpdated(address,address,uint256,uint256,address,uint256,uint256)"), k("ListingCancelled(address,address,uint256)")
TT = k("Transfer(address,address,uint256)")
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; LM = "0x3d7a352796a8c0d8bbd6b2c3cb95f129e94a763d"; USDC = "3c499c542cef5e3811e1192ce70d8cc03d5c3359"
URLS = ["https://polygon.gateway.tenderly.co", "https://polygon.drpc.org", "https://rpc-mainnet.matic.quiknode.pro"]
def rpc(m, p):
    for i in range(9):
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(URLS[i % 3], data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"}), timeout=40).read())
            if "result" in r: return r["result"]
        except Exception: pass
        time.sleep(1 + i)
    raise RuntimeError(m)
tok = {int(t): v for t, v in json.load(open("probe/tokmap.json")).items()}
def fix(t):
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/apiMarket.php", data=json.dumps({"command": "getNFTInfos", "contractAddress": NFT, "nftId": str(t)}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"}), timeout=20).read())
        tok[t][1] = r["traits"]["Rarity"][0]
    except Exception: pass
with ThreadPoolExecutor(6) as p: list(p.map(fix, [t for t, v in tok.items() if v[1] == "Not revealed"]))
latest = int(rpc("eth_blockNumber", []), 16)
START = 94_300_000
def logs(params):
    out = []
    for lo in range(START, latest + 1, 100_000):
        out += rpc("eth_getLogs", [{**params, "fromBlock": hex(lo), "toBlock": hex(min(latest, lo + 99_999))}]); time.sleep(0.2)
    return out
lev = [e for e in logs({"address": LM, "topics": [[TL, TU, TC], None, "0x" + NFT[2:].rjust(64, "0")]}) if int(e["topics"][3], 16) in tok]
tev = []
for lo in range(START, latest + 1, 50_000):
    for e in rpc("eth_getLogs", [{"address": NFT, "topics": [TT], "fromBlock": hex(lo), "toBlock": hex(min(latest, lo + 49_999))}]):
        if len(e["topics"]) == 4 and int(e["topics"][3], 16) in tok: tev.append(e)
    time.sleep(0.2)
print("listing events", len(lev), "transfers", len(tev), flush=True)
# block -> time: interpolate between sampled blocks
samples = {}
for b in range(START, latest + 1, 200_000): samples[b] = int(rpc("eth_getBlockByNumber", [hex(b), False])["timestamp"], 16)
samples[latest] = int(rpc("eth_getBlockByNumber", [hex(latest), False])["timestamp"], 16)
sb = sorted(samples)
def bt(b):
    for a, c in zip(sb, sb[1:]):
        if a <= b <= c: return samples[a] + (samples[c] - samples[a]) * (b - a) / (c - a)
    return samples[sb[-1]]
events = []  # (time, order, kind, token, data)
for e in lev:
    t = int(e["topics"][3], 16); seller = "0x" + e["topics"][1][-40:]
    if e["topics"][0] == TC: events.append((bt(int(e["blockNumber"], 16)), int(e["blockNumber"], 16), int(e["logIndex"], 16), "C", t, seller, None, None))
    else:
        d = e["data"][2:]; price = int(d[:64], 16); cur = d[64 + 24:128]; exp = int(d[128:192], 16)
        events.append((bt(int(e["blockNumber"], 16)), int(e["blockNumber"], 16), int(e["logIndex"], 16), "L", t, seller, price / 1e6 if cur == USDC else None, exp))
mints = {}
for e in tev:
    t = int(e["topics"][3], 16); frm = "0x" + e["topics"][1][-40:]
    ts = bt(int(e["blockNumber"], 16))
    if int(frm, 16) == 0: mints[t] = min(mints.get(t, ts), ts)
    events.append((ts, int(e["blockNumber"], 16), int(e["logIndex"], 16), "T", t, frm, None, None))
events.sort(key=lambda x: (x[1], x[2]))
cards = {}
for t, (c, r, s) in tok.items(): cards.setdefault(c, []).append(t)
for card in ("g0218", "g0211", "g0207"):
    ids = set(cards[card]); m = min(mints[t] for t in ids if t in mints)
    live = {}; series = []; i = 0
    evs = [e for e in events if e[4] in ids]
    hour = m - (m % 3600)
    now = time.time()
    while hour <= now:
        while i < len(evs) and evs[i][0] <= hour + 3600:
            ts, b, li, kind, t, who, price, exp = evs[i]; i += 1
            if kind == "C": live.pop(t, None)
            elif kind == "L":
                if price is not None: live[t] = (who, price, exp)
                else: live.pop(t, None)
            elif kind == "T" and t in live and live[t][0] == who: live.pop(t, None)
        end = hour + 3600
        act = [(p, t) for t, (w, p, x) in live.items() if not x or x > end]
        lim = [p for p, t in act if tok[t][1] == "Limited"]
        allp = sorted(p for p, t in act)
        series.append((hour, allp[0] if allp else None, min(lim) if lim else None, len(allp), sum(1 for p in allp if allp and p <= allp[0] * 1.15)))
        hour += 3600
    print(f"\n== {card} first mint {datetime.fromtimestamp(m, timezone.utc):%Y-%m-%d %H:%M} UTC, copies {len(ids)}")
    for h, fa, fl, n, near in series:
        dt = datetime.fromtimestamp(h, timezone.utc) + timedelta(hours=2)
        if dt.hour % 3 == 0 or h == series[-1][0]:
            print(f"{dt:%a %d.%m %H:00} floor {fa} limited {fl} listings {n} near_floor {near}")
