# One-off research: decode real withdraw() transactions on the DOLZ auction and find the leaf encoding.
import urllib.request, json
from eth_abi import decode, encode
from Crypto.Hash import keccak as K
def k(b): h = K.new(digest_bits=256); h.update(b); return h.digest()
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com"]
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=30).read())
            if "result" in r: return r["result"]
            print("err", u, r.get("error"))
        except Exception as e: print("ex", u, e)
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
latest = int(rpc("eth_blockNumber", []), 16)
txs = []
for frm in [C, "0x" + rpc("eth_call", [{"to": C, "data": "0x62b5bdf8"}, "latest"])[-40:]]:
    for start in range(latest - 6000, latest, 2000):
        logs = rpc("eth_getLogs", [{"address": NFT, "topics": [T, "0x" + "0" * 24 + frm[2:]], "fromBlock": hex(start), "toBlock": hex(start + 1999)}]) or []
        for l in logs:
            if l["transactionHash"] not in txs: txs.append(l["transactionHash"])
print("withdraw-ish txs", len(txs))
def verify(leaf, proof, root):
    h = leaf
    for p in proof: h = k(min(h, p) + max(h, p))
    return h == root
encs = {
 "encode(tuple)": lambda t, r, a: k(encode(["(uint256[],uint256,address)"], [(t, r, a)])),
 "encode(fields)": lambda t, r, a: k(encode(["uint256[]", "uint256", "address"], [t, r, a])),
 "dbl tuple": lambda t, r, a: k(k(encode(["(uint256[],uint256,address)"], [(t, r, a)]))),
 "dbl fields": lambda t, r, a: k(k(encode(["uint256[]", "uint256", "address"], [t, r, a]))),
 "packed": lambda t, r, a: k(b"".join(x.to_bytes(32, "big") for x in t) + r.to_bytes(32, "big") + bytes.fromhex(a[2:])),
 "packed addr first": lambda t, r, a: k(bytes.fromhex(a[2:]) + b"".join(x.to_bytes(32, "big") for x in t) + r.to_bytes(32, "big")),
 "packed addr last refund first": lambda t, r, a: k(r.to_bytes(32, "big") + b"".join(x.to_bytes(32, "big") for x in t) + bytes.fromhex(a[2:])),
 "encode(addr,uint[],uint)": lambda t, r, a: k(encode(["address", "uint256[]", "uint256"], [a, t, r])),
 "dbl encode(addr,uint[],uint)": lambda t, r, a: k(k(encode(["address", "uint256[]", "uint256"], [a, t, r]))),
}
for h in txs[:6]:
    tx = rpc("eth_getTransactionByHash", [h])
    inp = tx["input"]
    print("\nTX", h, "from", tx["from"], "to", tx["to"], "sel", inp[:10], "block", int(tx["blockNumber"], 16))
    if inp[:10] != "0xb5c1d22d": print(" input", inp[:600]); continue
    (t, r, a), second, proof = decode(["(uint256[],uint256,address)", "bytes32", "bytes32[]"], bytes.fromhex(inp[10:]))
    root = bytes.fromhex(rpc("eth_call", [{"to": C, "data": "0x244cb2c8"}, hex(int(tx["blockNumber"], 16))])[2:66])
    print(" tokens", t, "refund", r, "claimer", a, "second", second.hex(), "proof len", len(proof), "root@block", root.hex())
    for n, f in encs.items():
        leaf = f(list(t), r, a)
        print("  ", n, "leaf==second", leaf == second, "verifies(leaf)", verify(leaf, proof, root), "verifies(second)", verify(second, proof, root))
