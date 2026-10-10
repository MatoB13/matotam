# One-off check: how the GEORGIA auction prizes reached the wallet and what auction / token / bids were involved.
import urllib.request, json
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read())
    return r.get("result")
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
W = {"0xa4cd3de07dafa3f700c908043118b39547190143": "main", "0x49fcb83bed9983b9b9e4cf4e067c66e70d874a9d": "kernel", "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6": "hot"}
for tid in [91358, 91262]:
    d = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://cardsdata.dolz.io/jsons/{tid}.json", headers={"user-agent": "Mozilla/5.0"}), timeout=20).read())
    a = {x["trait_type"]: x["value"] for x in d["attributes"]}
    print("\nTOKEN", tid, d["name"], a.get("Rarity"), a.get("Serial Number"), a.get("Season"))
    for l in rpc("eth_getLogs", [{"address": NFT, "topics": [T, None, None, "0x" + hex(tid)[2:].rjust(64, "0")], "fromBlock": hex(70_000_000), "toBlock": "latest"}]):
        tx = rpc("eth_getTransactionByHash", [l["transactionHash"]])
        print("  transfer from", "0x" + l["topics"][1][-40:], "to", W.get("0x" + l["topics"][2][-40:], "0x" + l["topics"][2][-40:]), "tx.from", W.get(tx["from"], tx["from"]), "tx.to", tx["to"], "sel", tx["input"][:10])
        if tx["input"][:10] == "0xb5c1d22d":
            c = tx["to"]
            print("  auction", c, "token()", rpc("eth_call", [{"to": c, "data": "0xfc0c546a"}, "latest"]))
            # payments from our wallets to the auction contract
            for w in W:
                for s in [{"topics": [T, "0x" + "0" * 24 + w[2:], "0x" + "0" * 24 + c[2:]]}]:
                    pays = rpc("eth_getLogs", [{**s, "fromBlock": hex(70_000_000), "toBlock": "latest"}]) or []
                    for p in pays[:6]:
                        ptx = rpc("eth_getTransactionByHash", [p["transactionHash"]])
                        print("    pay", W[w], "token", p["address"], "amount", int(p["data"], 16), "sel", ptx["input"][:10], "tx.from", W.get(ptx["from"], ptx["from"]))
