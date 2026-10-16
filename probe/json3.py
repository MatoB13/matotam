# One-off research: the g0207 card JSON as served now, with different request headers and cache busters.
import urllib.request, time, json
def get(url, h):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=25)
        return r.status, {k: v for k, v in r.headers.items() if k.lower() in ("last-modified", "cf-cache-status", "age", "etag", "x-cache", "server", "cache-control")}, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), {}, repr(e)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
for tid in ("106215", "106017", "105950"):
    for url, h in [(f"https://cardsdata.dolz.io/jsons/{tid}.json", {"user-agent": "Mozilla/5.0"}),
                   (f"https://cardsdata.dolz.io/jsons/{tid}.json?t={int(time.time())}", {"user-agent": UA, "accept": "application/json", "origin": "https://dolz.io", "referer": "https://dolz.io/"}),
                   (f"https://cardsdata.dolz.io/jsons/{tid}.json", {"user-agent": UA, "cache-control": "no-cache", "pragma": "no-cache"})]:
        st, hd, b = get(url, h)
        try:
            j = json.loads(b); attrs = {a.get("trait_type"): a.get("value") for a in j.get("attributes", [])}
            print(tid, st, hd, j.get("name"), attrs, j.get("image"))
        except Exception:
            print(tid, st, hd, b[:300])
