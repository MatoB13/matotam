# One-off check: rarity of the hot wallet's g0207 cards from every DOLZ source we know.
import urllib.request, json, re, time
HOT = "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"
IDS = [106215, 106216, 106217, 106218, 106219]
def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        return "ERR " + repr(e)[:80]
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    except Exception as e:
        return "ERR " + repr(e)
for t in IDS:
    j = get(f"https://cardsdata.dolz.io/jsons/{t}.json?t={int(time.time()*1000)}")
    m = re.search(r'"Rarity",\s*"value":\s*"([^"]+)"', j)
    print(t, "json rarity:", m.group(1) if m else j[:80])
for cmd in ("getUserNFTs", "getOwnedNFTList", "getFrozenNFTs"):
    for key in ("wallet", "userAddress", "address"):
        r = api({"command": cmd, key: HOT})
        if r and not r.startswith("ERR") and len(r) > 5:
            print(f"\n{cmd} {key}: {len(r)} chars")
            for t in IDS:
                i = r.find(str(t))
                if i >= 0: print("  ", t, "->", r[max(0, i - 200): i + 400].replace("\n", " "))
            if not any(str(t) in r for t in IDS): print("  sample:", r[:600])
            break
for url in [f"https://dolz.io/marketplace/item/{IDS[0]}", f"https://dolz.io/marketplace/nft/{IDS[0]}", f"https://dolz.io/marketplace/token/0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc/{IDS[0]}", f"https://dolz.io/marketplace/assets/0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc/{IDS[0]}"]:
    h = get(url)
    m = re.findall(r'(?i)(Legendary|Epic|Rare|Limited|Not revealed)', h)
    print(url, len(h), set(m) if m else h[:100])
