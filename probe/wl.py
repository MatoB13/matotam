# One-off research: which Merkle leaf format the g0201 whitelist root uses.
import urllib.request, json, subprocess, sys, site, importlib
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "pycryptodome"], check=False)
sys.path.append(site.getusersitepackages()); importlib.invalidate_caches()
from Crypto.Hash import keccak as _k
def keccak(b):
    h = _k.new(digest_bits=256); h.update(b); return h.digest()
req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps({"command": "getWhitelistForCard", "card": "g0201"}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
wl = json.loads(urllib.request.urlopen(req, timeout=30).read())
ROOT = "e1ec199d7bc533b8fd9bdf8bfb64ad502100d856b31ef47a65915ee18040fd78"
def root(leaves, sort_leaves):
    layer = sorted(leaves) if sort_leaves else list(leaves)
    while len(layer) > 1:
        nxt = []
        for i in range(0, len(layer), 2):
            if i + 1 == len(layer): nxt.append(layer[i]); continue
            a, b = sorted((layer[i], layer[i + 1]))
            nxt.append(keccak(a + b))
        layer = nxt
    return layer[0].hex()
addrs = list(wl)
cands = {
    "keccak(addr)": lambda a, n: keccak(bytes.fromhex(a[2:])),
    "keccak(addr,n packed)": lambda a, n: keccak(bytes.fromhex(a[2:]) + n.to_bytes(32, "big")),
    "OZ keccak(keccak(abi.encode(addr)))": lambda a, n: keccak(keccak(bytes.fromhex(a[2:]).rjust(32, b"\0"))),
    "OZ keccak(keccak(abi.encode(addr,n)))": lambda a, n: keccak(keccak(bytes.fromhex(a[2:]).rjust(32, b"\0") + n.to_bytes(32, "big"))),
    "keccak(abi.encode(addr))": lambda a, n: keccak(bytes.fromhex(a[2:]).rjust(32, b"\0")),
}
print(len(wl), "addresses")
for name, fn in cands.items():
    for oname, order in [("listed", addrs), ("sorted", sorted(addrs))]:
        leaves = [fn(a.lower(), wl[a]) for a in order]
        for s in (False, True):
            if root(leaves, s) == ROOT: print("MATCH", name, oname, "sortLeaves" if s else "")
