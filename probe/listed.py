# One-off check: can the dolz.io market API list all cards for sale at once (getNFTsForAttributes), and how fast.
import urllib.request, json, base64, time
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
def api(p):
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/apiMarket.php", data=json.dumps(p).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"}), timeout=20)
        b = r.read().decode("utf-8", "replace")
    except Exception as e:
        b = "ERR " + repr(e)
    return round(time.time() - t, 2), b
enc = lambda o: base64.b64encode(json.dumps(o).encode()).decode()
for attrs in ({}, [], {"Card Number": ["g0207"]}, {"Card Number": "g0207"}):
    for status in ("listed", "onSale", "forSale", "all"):
        for sort in ("price_asc", "priceAsc", "lowest", None):
            dt, b = api({"command": "getNFTsForAttributes", "contractAddress": NFT, "attributes": enc(attrs), "status": status, "page": 1, "limit": 3, "sort": sort, "walletAddress": None, "boosted": False})
            if '"total":0' not in b:
                print(json.dumps(attrs), status, sort, dt, b[:700]); print()
print("done")
