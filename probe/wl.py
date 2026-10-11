# One-off research: dump the public g0201 whitelist (Merkle leaves are checked offline).
import urllib.request, json
req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps({"command": "getWhitelistForCard", "card": "g0201"}).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
print("WL " + urllib.request.urlopen(req, timeout=30).read().decode())
