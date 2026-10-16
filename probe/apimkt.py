# One-off research: back.dolz.io/apiMarket.php (the dolz.io market's own API) for revealed g0207 cards.
import urllib.request, json, base64, time
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
def api(p):
    t = time.time()
    r = urllib.request.urlopen(urllib.request.Request("https://back.dolz.io/apiMarket.php", data=json.dumps(p).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"}), timeout=30)
    return r.status, round(time.time() - t, 2), r.read().decode("utf-8", "replace")
for nid in ("106215", "106219", "106017"):
    st, dt, b = api({"command": "getNFTInfos", "contractAddress": NFT, "nftId": nid}); print("getNFTInfos", nid, st, dt, len(b), b[:2500], "\n")
attrs = base64.b64encode(json.dumps({"Card Number": ["g0207"]}).encode()).decode()
for status in ("listed", "all", None):
    st, dt, b = api({"command": "getNFTsForAttributes", "contractAddress": NFT, "attributes": attrs, "status": status, "page": 1, "limit": 3, "sort": "price_asc", "walletAddress": None, "boosted": False})
    print("getNFTsForAttributes", status, st, dt, len(b), b[:2500], "\n")
st, dt, b = api({"command": "getUserNFTs", "contractAddress": NFT, "walletAddress": HOT}); print("getUserNFTs", st, dt, len(b), b[:1500])
st, dt, b = api({"command": "getMarketplaceAttributes", "contractAddress": NFT}); print("attrs", st, dt, len(b), b[:800])
