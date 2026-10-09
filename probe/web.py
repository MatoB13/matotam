# One-off research: which dolz.io API the "Withdraw prizes" button calls (public frontend code only).
import re, urllib.request
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")
    except Exception as e: print("GET fail", url, e); return ""
main = get("https://dolz.io/static/js/main.f0a2dbee.js")
print("api.php ctx:")
for m in list(re.finditer(r'api\.php|back\.dolz|BACK_?URL|REACT_APP_[A-Z_]+', main))[:15]:
    print("  >>", main[max(0, m.start() - 200): m.end() + 200].replace("\n", " "))
i = main.find('"static/js/"+')
seg = main[i:i + 60000]
# the second object literal is the id->hash map
maps = re.findall(r'\{((?:\d+:"[0-9a-f]{8}",?)+)\}', seg)
ids = []
for mp in maps:
    ids += re.findall(r'(\d+):"([0-9a-f]{8})"', mp)
names = dict(re.findall(r'(\d+):"([a-zA-Z0-9_-]+)"', seg[:20000]))
print("chunks", len(ids))
for cid, h in ids:
    name = names.get(cid, cid)
    if "syntax" in name: continue
    js = get(f"https://dolz.io/static/js/{name}.{h}.chunk.js")
    if not re.search(r'(?i)withdraw|hashroot|proof|api\.php', js): continue
    print(f"\n######## chunk {name} {len(js)}")
    for m in list(re.finditer(r'(?i)withdraw[a-z]*|getHashRoot|proof|api\.php', js))[:25]:
        print("  >>", js[max(0, m.start() - 300): m.end() + 300].replace("\n", " "))
