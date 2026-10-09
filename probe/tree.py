# One-off research: rebuild the DOLZ auction withdraw Merkle tree from public data and match the on-chain root.
import urllib.request, json, time
from concurrent.futures import ThreadPoolExecutor
UA = {"user-agent": "Mozilla/5.0 Chrome/126", "origin": "https://dolz.io", "referer": "https://dolz.io/", "content-type": "application/json"}
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]
def post(body):
    for i in range(3):
        try: return json.loads(urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(body).encode(), headers=UA), timeout=30).read())
        except Exception as e: time.sleep(1)
    return None
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=30).read())
            if "result" in r: return r["result"]
        except Exception: pass
print("root", rpc("eth_call", [{"to": C, "data": "0x244cb2c8"}, "latest"]))
bids = post({"command": "getContractBids", "contractAddress": C}) or []
bidders = sorted({b["bidder"].lower() for b in bids})
print("bids", len(bids), "bidders", len(bidders), "hot bids", [b for b in bids if b["bidder"].lower() == HOT])
print("tokenIds sample counts", len(bids))
def one(a): return a, post({"command": "getUserWithdraw", "contractAddress": C, "userAddress": a})
with ThreadPoolExecutor(8) as ex: res = list(ex.map(one, bidders))
entries = [e for a, r in res for e in (r or [])]
print("entries", len(entries), "empty", sum(1 for a, r in res if not r))
print("sample", entries[:3])
print("main entry", [e for e in entries if e["dawClaimer"].lower() == "0xa4cd3de07dafa3f700c908043118b39547190143"])
print("hot entry", [e for e in entries if e["dawClaimer"].lower() == HOT])
json.dump(entries, open("/tmp/entries.json", "w"))
# leaf candidates
try:
    from Crypto.Hash import keccak
except ImportError:
    import subprocess; subprocess.run(["pip", "install", "-q", "pycryptodome", "eth-abi"]); from Crypto.Hash import keccak
from eth_abi import encode
def k(b): h = keccak.new(digest_bits=256); h.update(b); return h.digest()
def tree_root(leaves):
    layer = sorted(leaves) if False else leaves
    while len(layer) > 1:
        nxt = []
        for i in range(0, len(layer), 2):
            if i + 1 < len(layer):
                a, b = sorted([layer[i], layer[i + 1]]); nxt.append(k(a + b))
            else: nxt.append(layer[i])
        layer = nxt
    return layer[0].hex() if layer else None
def parse(e): return [int(x) for x in json.loads(e["dawTokenIDs"])], int(e["dawRefundAmount"]), e["dawClaimer"]
cands = {
  "encode(uint[],uint,addr)": lambda t, r, a: k(encode(["uint256[]", "uint256", "address"], [t, r, a])),
  "encode(tuple)": lambda t, r, a: k(encode(["(uint256[],uint256,address)"], [(t, r, a)])),
  "packed": lambda t, r, a: k(b"".join(x.to_bytes(32, "big") for x in t) + r.to_bytes(32, "big") + bytes.fromhex(a[2:])),
  "packed addr first": lambda t, r, a: k(bytes.fromhex(a[2:]) + b"".join(x.to_bytes(32, "big") for x in t) + r.to_bytes(32, "big")),
  "double encode(uint[],uint,addr)": lambda t, r, a: k(k(encode(["uint256[]", "uint256", "address"], [t, r, a]))),
  "double encode(tuple)": lambda t, r, a: k(k(encode(["(uint256[],uint256,address)"], [(t, r, a)]))),
}
for name, f in cands.items():
    leaves = [f(*parse(e)) for e in entries]
    for order in ["as is", "sorted"]:
        L = sorted(leaves) if order == "sorted" else leaves
        print(name, order, tree_root(L))
