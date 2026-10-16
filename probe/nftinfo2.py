# One-off research: the dolz.io app's NFT data commands with their real parameters, for revealed g0207 cards.
import urllib.request, json, base64
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    except Exception as e:
        return "ERR " + repr(e)
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"; HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
for nft in ("106017", "106215", 106219):
    r = api({"command": "getNFTInfos", "contractAddress": NFT, "nftId": nft})
    print("getNFTInfos", nft, len(r), r[:1200].replace("\n", " "), "\n")
r = api({"command": "getUserNFTs", "contractAddress": NFT, "walletAddress": HOT})
print("getUserNFTs", len(r))
for t in ("106215", "106219"):
    i = r.find(t)
    print("  ", t, r[max(0, i - 300): i + 500].replace("\n", " ") if i >= 0 else "not in list")
attrs = base64.b64encode(json.dumps({"Card Number": ["g0207"]}).encode()).decode()
r = api({"command": "getNFTsForAttributes", "contractAddress": NFT, "attributes": attrs, "status": "listed", "page": 1, "limit": 5, "sort": "price_asc", "walletAddress": None, "boosted": False})
print("getNFTsForAttributes", len(r), r[:1500].replace("\n", " "))
