# One-off check: can Tenderly return the MetaMask wallet's whole approval history in one getLogs (no address filter)?
import urllib.request, json, time, collections
W = "0xa4cd3de07dafa3f700c908043118b39547190143"
AP = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"; AFA = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31"
T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
def rpc(m, p):
    t = time.time()
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=90).read())
        return r.get("result"), r.get("error"), time.time() - t
    except Exception as e: return None, str(e), time.time() - t
owner = "0x" + "0" * 24 + W[2:]
res, err, dt = rpc("eth_getLogs", [{"topics": [[AP, AFA], owner], "fromBlock": hex(70_000_000), "toBlock": "latest"}])
print("approvals", len(res or []), err, f"{dt:.1f}s")
c = collections.Counter((l["address"], l["topics"][0][:10], "0x" + l["topics"][2][-40:] if len(l["topics"]) > 2 else "") for l in res or [])
for k, v in c.most_common(30): print(" ", k, v)
latest = int(rpc("eth_blockNumber", [])[0], 16)
res, err, dt = rpc("eth_getLogs", [{"topics": [T, owner], "fromBlock": hex(latest - 2000), "toBlock": hex(latest)}])
print("transfers out last 2000 blocks", len(res or []), err, f"{dt:.1f}s")
