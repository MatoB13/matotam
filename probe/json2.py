# One-off check: are the hot wallet's g0207 cards revealed in their JSON by now (with and without cache busting)?
import urllib.request, json, time, re
def get(url, headers=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0", **(headers or {})}), timeout=25)
        return r.read().decode("utf-8", "replace"), dict(r.headers)
    except Exception as e:
        return "ERR " + repr(e)[:80], {}
for t in [106215, 106216, 106217, 106218, 106219, 106017]:
    for variant, url, h in [("plain", f"https://cardsdata.dolz.io/jsons/{t}.json", None),
                            ("bust", f"https://cardsdata.dolz.io/jsons/{t}.json?v={time.time()}", {"cache-control": "no-cache", "pragma": "no-cache"})]:
        body, headers = get(url, h)
        rar = re.search(r'"Rarity",\s*"value":\s*"([^"]+)"', body)
        ser = re.search(r'"Serial Number",\s*"value":\s*"([^"]+)"', body)
        print(t, variant, rar.group(1) if rar else body[:60], ser.group(1) if ser else "", "| cache:", {k: v for k, v in headers.items() if k.lower() in ("age", "cache-control", "last-modified", "x-cache", "cf-cache-status", "etag")})
