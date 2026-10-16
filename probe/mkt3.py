# One-off research: every chunk of the dolz.io marketplace app, searched for its data source.
import urllib.request, re
def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        return ""
html = get("https://dolz.io/marketplace")
print("html head:", re.sub(r"\s+", " ", html[:1500]))
paths = set(re.findall(r'(/marketplace/_next/static/[^"\'\s\\)]+\.js)', html))
web = [p for p in paths if "webpack" in p]
body = "".join(get("https://dolz.io" + p) for p in paths)
if web:
    wp = get("https://dolz.io" + web[0])
    # chunk id -> hash map: "static/chunks/" + ({..names..}[e]||e) + "." + {..hashes..}[e] + ".js"
    names = dict(re.findall(r'(\d+):"([0-9a-f]{16})"', wp))
    named = dict(re.findall(r'(\d+):"([a-zA-Z0-9_\-/\[\]]+)"', wp))
    print("webpack chunks:", len(names))
    for cid, h in names.items():
        n = named.get(cid, cid) if not re.fullmatch(r"[0-9a-f]{16}", named.get(cid, "x")) else cid
        url = f"https://dolz.io/marketplace/_next/static/chunks/{n}.{h}.js"
        b = get(url)
        if b: body += b
print("total js", len(body))
for pat in [r'https?://[a-zA-Z0-9.\-]+\.[a-z]{2,}[a-zA-Z0-9_\-./]*', r'"/api/[^"]+"', r'command:"[A-Za-z]+"', r'(?i)not revealed', r'(?i)"rarity"', r'createServerReference\)\("([0-9a-f]{40,})"']:
    found = sorted(set(re.findall(pat, body)))[:40]
    print(f"\n{pat}: {found}")
for k in ["Not revealed", "revealed", "getNFT", "rarity"]:
    for m in list(re.finditer(k, body))[:2]:
        print(f"\n[{k}] {body[max(0,m.start()-300):m.end()+300]}")
