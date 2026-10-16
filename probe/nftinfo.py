# One-off research: parameters of the dolz.io app's NFT data commands, then call them for revealed g0207 cards.
import urllib.request, json, re
def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception:
        return ""
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    except Exception as e:
        return "ERR " + repr(e)
html = get("https://dolz.io/")
body = "".join(get("https://dolz.io" + s if s.startswith("/") else s) for s in re.findall(r'src="([^"]+\.js[^"]*)"', html))
for cmd in ["getNFTInfos", "getNFTInfosFromIS", "getUserNFTs", "getOwnedNFTList", "getCardsInfos", "getNFTsForAttributes", "getNFTEvents", "getCardEstimatedValue"]:
    for m in list(re.finditer(r'command:"%s"[^}]*}' % cmd, body))[:2]:
        print(cmd, "->", m.group(0)[:200])
HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
tries = [
    {"command": "getNFTInfos", "tokenId": "106017", "contractAddress": "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"},
    {"command": "getNFTInfos", "nftId": "106017"},
    {"command": "getNFTInfos", "id": "106017"},
    {"command": "getNFTInfosFromIS", "tokenId": "106017"},
    {"command": "getUserNFTs", "wallet": HOT},
    {"command": "getUserNFTs", "userAddress": HOT},
    {"command": "getOwnedNFTList", "wallet": HOT},
    {"command": "getOwnedNFTList", "userAddress": HOT},
]
for t in tries:
    r = api(t)
    print(t, "->", len(r), r[:400].replace("\n", " "))
