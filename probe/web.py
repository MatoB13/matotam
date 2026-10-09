# One-off research: which dolz.io API the "Withdraw prizes" button calls (public frontend code only).
import re, urllib.request, json
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")
    except Exception as e:
        print("GET fail", url, e); return ""
page = get("https://dolz.io/auction/0x9e8c5bb7a649a77e80E04300916cD85f3304bb69")
print("page len", len(page))
scripts = sorted(set(re.findall(r'(?:src|href)="([^"]+\.js[^"]*)"', page)))
print("scripts", len(scripts))
seen = set()
queue = [s if s.startswith("http") else "https://dolz.io" + s for s in scripts]
hits = []
while queue and len(seen) < 160:
    url = queue.pop(0)
    if url in seen: continue
    seen.add(url)
    js = get(url)
    for m in re.findall(r'"(/_next/static/chunks/[^"]+\.js)"', js):
        queue.append("https://dolz.io" + m)
    for m in re.finditer(r'(?i)(withdraw|hashroot|merkle|proof|claimPrize|prizes)', js):
        hits.append((url.rsplit("/", 1)[-1], js[max(0, m.start() - 250): m.end() + 250].replace("\n", " ")))
print("fetched", len(seen))
urls = set()
for _, ctx in hits:
    urls.update(re.findall(r'["`](https?://[^"`]+|/[a-zA-Z0-9_/${}.-]*(?:withdraw|proof|auction|prize|claim)[a-zA-Z0-9_/${}.-]*)["`]', ctx))
print("URLS", sorted(urls)[:80])
shown = 0
for name, ctx in hits:
    if re.search(r'(?i)proof|withdraw\(|hashRoot|prize', ctx) and shown < 40:
        print("\n---", name, ctx); shown += 1
for u in ["https://dolz.io/api", "https://api.dolz.io"]:
    pass
