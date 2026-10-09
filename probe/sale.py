# One-off check: the user's recent marketplace sales and how each sold card was acquired (public chain data).
import urllib.request, json, datetime
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read())
    return r.get("result")
def card(tid):
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://cardsdata.dolz.io/jsons/{tid}.json", headers={"user-agent": "Mozilla/5.0"}), timeout=20).read())
        a = {x["trait_type"]: x["value"] for x in d.get("attributes", [])}
        return f'{d.get("name")} {a.get("Rarity")} #{a.get("Serial Number")}'
    except Exception as e: return f"? {e}"
SM = "0xe7693ba9cf616a55b88f3ca7b74db3358b5767ee"; SALE = "0x2b5c13abb9a5bb44b8c0573ec2ed9d9f2113bc77c8ba0ef031c8143111a87aa6"
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
W = {"main": "0xa4cd3de07dafa3f700c908043118b39547190143", "kernel": "0x49fcb83bed9983b9b9e4cf4e067c66e70d874a9d", "hot": "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"}
topic = lambda a: "0x" + "0" * 24 + a[2:]
latest = int(rpc("eth_blockNumber", []), 16)
ts = lambda l: datetime.datetime.utcfromtimestamp(int(l["blockTimestamp"], 16)).isoformat()
for name, w in W.items():
    for role, topics in [("SOLD", [SALE, topic(w)]), ("BOUGHT", [SALE, None, topic(w)])]:
        for l in rpc("eth_getLogs", [{"address": SM, "topics": topics, "fromBlock": hex(latest - 43200 * 5), "toBlock": "latest"}]) or []:
            words = [l["data"][2 + i * 64: 66 + i * 64] for i in range(4)]
            tid = int(words[0], 16); price = int(words[1], 16) / 1e6
            print(f"{ts(l)} {name} {role} token {tid} {card(tid)} for ${price:.2f} tx {l['transactionHash']}")
            if role == "SOLD":
                # how did we get this token?
                for w2n, w2 in W.items():
                    for x in rpc("eth_getLogs", [{"address": NFT, "topics": [T, None, topic(w2), "0x" + hex(tid)[2:].rjust(64, "0")], "fromBlock": hex(70_000_000), "toBlock": "latest"}]) or []:
                        rc = rpc("eth_getTransactionReceipt", [x["transactionHash"]])
                        pays = [(y["address"][:10], int(y["data"], 16) / 1e6, "from " + y["topics"][1][-40:][:8], "to " + y["topics"][2][-40:][:8]) for y in rc["logs"] if y["topics"][0] == T and len(y["topics"]) == 3]
                        sale = [int(y["data"][66:130], 16) / 1e6 for y in rc["logs"] if y["topics"][0] == SALE]
                        print(f"    acquired by {w2n} at {ts(x)} from 0x{x['topics'][1][-40:][:8]} tx {x['transactionHash']} sale-price {sale} erc20 {pays}")
