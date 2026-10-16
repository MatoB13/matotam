# One-off check: the dolz.io marketplace app's data endpoints (to read revealed rarities like the site does).
import urllib.request, json, re
def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        return ""
pages = ["https://dolz.io/marketplace", "https://dolz.io/marketplace/collection/0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc", "https://dolz.io/marketplace/nft/0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc/106017"]
chunks = set()
for p in pages:
    h = get(p)
    print(p, len(h))
    chunks |= set(re.findall(r'(/marketplace/_next/static/[^"\'\s\\]+\.js)', h))
    for m in re.findall(r'https?://[a-zA-Z0-9.\-]+\.[a-z]{2,}(?:/[a-zA-Z0-9_\-./]*)?', h):
        if any(k in m for k in ("api", "back", "supabase", "graphql", "json")): print("  url in html:", m)
    for m in list(re.finditer(r'(?i)"rarity"\s*:\s*"[^"]+"', h))[:5]: print("  html rarity:", h[max(0, m.start()-200):m.end()+50])
print("chunks", len(chunks))
body = ""
for c in sorted(chunks):
    body += get("https://dolz.io" + c)
urls = sorted(set(re.findall(r'https?://[a-zA-Z0-9.\-]+\.[a-z]{2,}(?:/[a-zA-Z0-9_\-./]*)?', body)))
print("urls:", [u for u in urls if "dolz" in u or "api" in u or "supabase" in u][:40])
print("commands:", sorted(set(re.findall(r'command\s*:\s*"([A-Za-z0-9_]+)"', body))))
for k in ["/api/", "fetch(\"", "fetch(`", "getNFT", "rarity"]:
    for m in list(re.finditer(re.escape(k), body))[:3]:
        print(f"\n[{k}] {body[max(0,m.start()-200):m.end()+250]}")
