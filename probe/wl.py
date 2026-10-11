# One-off research: g0201 whitelist membership of our wallets and how its Merkle leaves are built.
import urllib.request, json, subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pycryptodome"], check=True)
from Crypto.Hash import keccak
def k(b):
    h = keccak.new(digest_bits=256); h.update(b); return h.digest()
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())
wl = api({"command": "getWhitelistForCard", "card": "g0201"})
print("whitelist size", len(wl), "values", set(wl.values()))
W = {"main": "0xa4cd3de07dafa3f700c908043118b39547190143", "hot": "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6", "kernel": "0x49fcb83bed9983b9b9e4cf4e067c66e70d874a9d"}
for n, w in W.items(): print(n, "in whitelist:", w in {a.lower() for a in wl})
ROOT = "e1ec199d7bc533b8fd9bdf8bfb64ad502100d856b31ef47a65915ee18040fd78"
def root(leaves, sort_leaves):
    layer = sorted(leaves) if sort_leaves else list(leaves)
    while len(layer) > 1:
        nxt = []
        for i in range(0, len(layer), 2):
            if i + 1 == len(layer): nxt.append(layer[i]); continue
            a, b = sorted((layer[i], layer[i + 1]))
            nxt.append(k(a + b))
        layer = nxt
    return layer[0].hex()
addrs = list(wl.keys())
cands = {
    "keccak(addr)": lambda a, n: k(bytes.fromhex(a[2:])),
    "keccak(addr,uint256 n) packed": lambda a, n: k(bytes.fromhex(a[2:]) + n.to_bytes(32, "big")),
    "OZ double keccak(abi.encode(addr))": lambda a, n: k(k(bytes.fromhex(a[2:]).rjust(32, b"\0"))),
    "OZ double keccak(abi.encode(addr,n))": lambda a, n: k(k(bytes.fromhex(a[2:]).rjust(32, b"\0") + n.to_bytes(32, "big"))),
    "keccak(abi.encode(addr))": lambda a, n: k(bytes.fromhex(a[2:]).rjust(32, b"\0")),
}
for name, fn in cands.items():
    for order_name, order in [("as listed", addrs), ("lowercase sorted", sorted(a.lower() for a in addrs))]:
        leaves = [fn(a.lower(), int(wl[a] if a in wl else 1)) for a in order]
        for sort_leaves in (False, True):
            r = root(leaves, sort_leaves)
            if r == ROOT: print("MATCH", name, order_name, "sorted leaves" if sort_leaves else "")
print("done")
