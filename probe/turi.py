# One-off research: on-chain tokenURI of revealed g0207 cards now, metadata-update events, and the back.dolz.io answers in full.
import urllib.request, json
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
RPCS = ["https://polygon.drpc.org", "https://rpc-mainnet.matic.quiknode.pro", "https://polygon.gateway.tenderly.co", "https://1rpc.io/matic"]
def rpc(m, p):
    for u in RPCS:
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"}), timeout=20).read())
            if "result" in r: return r["result"]
            print("  ", u, r.get("error"))
        except Exception as e:
            print("  ", u, repr(e)[:80])
def s(hexdata):
    b = bytes.fromhex(hexdata[2:]); off = int.from_bytes(b[:32], "big"); n = int.from_bytes(b[off:off+32], "big"); return b[off+32:off+32+n].decode()
for tid in (106215, 106219, 106017, 105000):
    r = rpc("eth_call", [{"to": NFT, "data": "0xc87b56dd" + tid.to_bytes(32, "big").hex()}, "latest"])
    print("tokenURI", tid, s(r) if r else r)
bn = int(rpc("eth_blockNumber", []), 16); print("block", bn)
# EIP-4906 MetadataUpdate(uint256) / BatchMetadataUpdate(uint256,uint256), plus any non-Transfer event on the NFT in the last ~3 days
for back in range(0, 130000, 9000):
    lo, hi = bn - back - 9000, bn - back
    logs = rpc("eth_getLogs", [{"address": NFT, "fromBlock": hex(lo), "toBlock": hex(hi)}]) or []
    other = {}
    for l in logs:
        t0 = l["topics"][0]
        if t0 != "0xddf252ad1be2c89b69c2b068fc378daa952ba7f159e04ccdbe2a50ee8d01" and not t0.startswith("0xddf252ad"):
            other.setdefault(t0, []).append((int(l["blockNumber"], 16), l["data"][:140], l["topics"][1:]))
    if other: print(lo, hi, {k: (len(v), v[:2]) for k, v in other.items()})
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io", "referer": "https://dolz.io/"})
    try:
        r = urllib.request.urlopen(req, timeout=30); return r.status, dict(r.headers), r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), {}, repr(e)
for p in [{"command": "getDolzPrice"}, {"command": "getNFTInfos", "contractAddress": NFT, "nftId": 106215}, {"command": "getNFTInfosFromIS", "cardNumber": "g0207"},
          {"command": "getCardEstimatedValue", "contractAddress": NFT, "cardNumber": "g0207", "rarity": "Limited", "serialNumber": 1}]:
    st, h, b = api(p); print(p["command"], st, h.get("Content-Type"), h.get("Content-Length"), b[:600])
