# One-off check: is g0207 revealed in the card JSON, on IPFS (tokenURI) or in the dolz.io backend?
import urllib.request, json, time, collections
def get(url):
    try:
        return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=20).read())
    except Exception as e:
        return {"error": repr(e)[:100]}
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode()[:600]
    except Exception as e:
        return repr(e)
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read()))
    return r.get("result", r.get("error"))
counts = collections.Counter()
for tid in range(105902, 106502, 25):
    d = get(f"https://cardsdata.dolz.io/jsons/{tid}.json?t={int(time.time()*1000)}")
    a = {x.get("trait_type"): x.get("value") for x in d.get("attributes", [])} if "attributes" in d else {}
    counts[a.get("Rarity") or d.get("error", "?")] += 1
print("cardsdata sample rarities:", counts)
d = get(f"https://cardsdata.dolz.io/jsons/105902.json?t={int(time.time()*1000)}")
print("105902 json:", json.dumps(d)[:500])
# tokenURI on chain for one token
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
raw = rpc("eth_call", [{"to": NFT, "data": "0xc87b56dd" + hex(105902)[2:].rjust(64, "0")}, "latest"])
try:
    b = bytes.fromhex(raw[2:]); n = int.from_bytes(b[32:64], "big"); uri = b[64:64 + n].decode()
    print("tokenURI:", uri)
except Exception as e:
    print("tokenURI fail", raw, e)
for cmd in [{"command": "getNFTInfos", "tokenId": "105902"}, {"command": "getNFTInfos", "tokenID": 105902}, {"command": "getCardsInfos", "contractAddress": "0x6390e6cd5ca7b3be4ba7b97e936f5d596ec2f3b4"}]:
    print(cmd, "->", api(cmd))
