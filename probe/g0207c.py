# One-off check: which g0207 function is the public mint, and the whitelist mint's amount format (simulated).
import urllib.request, json, subprocess, sys, site, importlib
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--user", "pycryptodome"], check=False)
sys.path.append(site.getusersitepackages()); importlib.invalidate_caches()
from Crypto.Hash import keccak as _k
def keccak(b):
    h = _k.new(digest_bits=256); h.update(b); return h.digest()
import time
def rpc(m, p):
    for attempt in range(6):
        try:
            time.sleep(0.35)
            r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=90).read())
            return r.get("result", r.get("error"))
        except Exception as e:
            time.sleep(3 * (attempt + 1))
    return {"message": "rpc failed"}
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())
S = "0x6390e6cd5ca7b3be4ba7b97e936f5d596ec2f3b4"; START = 1791982800
HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"; MAIN = "0xa4cd3de07dafa3f700c908043118b39547190143"
w = lambda n: hex(n)[2:].rjust(64, "0")
def sim(frm, data, t):
    res = rpc("eth_call", [{"from": frm, "to": S, "data": data, "gas": hex(3_000_000)}, "latest", {}, {"time": hex(t)}])
    if isinstance(res, dict):
        return "REVERT " + str(res.get("message"))[:120]
    return "OK " + res[:80]
for sel in ["1004a9ee", "2899a783", "6f0ed2a3", "8e304e9c", "926cd4ca", "a9fc979e", "d6f2c57f", "f53a261d"]:
    for label, args in [("()", ""), ("(1)", w(1)), ("(1,10e6)", w(1) + w(10_000_000)), ("(1,10)", w(1) + w(10)), ("(hot)", w(int(HOT, 16)))]:
        for t in (START + 700,):
            print(sel, label, "t+%d" % (t - START), sim(HOT, "0x" + sel + args, t))
print("before start:", sim(HOT, "0xf53a261d" + w(1), START - 60))
wl = api({"command": "getWhitelistForCard", "card": "g0207"})
entries = [(a.lower(), int(n)) for a, n in wl.items()]
layer = [keccak(bytes.fromhex(a[2:]) + n.to_bytes(32, "big")) for a, n in entries]
layers = [layer]
while len(layers[-1]) > 1:
    cur, nxt = layers[-1], []
    for i in range(0, len(cur), 2):
        if i + 1 < len(cur):
            a, b = sorted((cur[i], cur[i + 1])); nxt.append(keccak(a + b))
        else:
            nxt.append(cur[i])
    layers.append(nxt)
print("root", layers[-1][0].hex(), "contract 71f7a554930c7bf2e0cd9cd8597c1a6744496fccf7c993468ececa404ecee160")
idx = [a for a, _ in entries].index(MAIN)
proof, i = [], idx
for layer in layers[:-1]:
    if i ^ 1 < len(layer): proof.append(layer[i ^ 1])
    i //= 2
for amount in (10, 10_000_000):
    data = "0xf2f3a93a" + w(1) + w(0x60) + w(amount) + w(len(proof)) + "".join(p.hex() for p in proof)
    for t in (START - 60, START + 5, START + 700):
        print("wl mint main amount", amount, "t%+d" % (t - START), sim(MAIN, data, t))
print("main USDC allowance to sale:", rpc("eth_call", [{"to": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "data": "0xdd62ed3e" + w(int(MAIN, 16)) + w(int(S, 16))}, "latest"]))
print("main USDC balance:", int(rpc("eth_call", [{"to": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "data": "0x70a08231" + w(int(MAIN, 16))}, "latest"]), 16) / 1e6)
print("hot USDC balance:", int(rpc("eth_call", [{"to": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "data": "0x70a08231" + w(int(HOT, 16))}, "latest"]), 16) / 1e6)
