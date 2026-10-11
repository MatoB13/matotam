# One-off research: which back.dolz.io commands the dolz.io web app uses for direct sales (drops).
import urllib.request, re, collections
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=30).read().decode("utf-8", "replace")
seen, scripts = set(), []
for page in ["https://dolz.io/", "https://dolz.io/drops", "https://dolz.io/shop", "https://dolz.io/marketplace"]:
    try:
        html = get(page)
    except Exception as e:
        print(page, "fail", e); continue
    print(page, len(html), re.findall(r"<title>(.*?)</title>", html)[:1])
    for src in re.findall(r'src="([^"]+\.js[^"]*)"', html):
        url = src if src.startswith("http") else "https://dolz.io" + (src if src.startswith("/") else "/" + src)
        if url not in seen: seen.add(url); scripts.append(url)
print("scripts", len(scripts))
bodies = {}
queue = list(scripts)
while queue and len(bodies) < 120:
    url = queue.pop(0)
    try:
        body = get(url)
    except Exception as e:
        continue
    bodies[url] = body
    for chunk in re.findall(r'"(static/js/[^"]+\.js|/_next/static/[^"]+\.js|assets/[^"]+\.js)"', body):
        u = "https://dolz.io/" + chunk.lstrip("/")
        if u not in seen: seen.add(u); queue.append(u)
print("bodies", len(bodies), sum(map(len, bodies.values())))
cmds = collections.Counter()
for body in bodies.values():
    for c in re.findall(r'command\s*:\s*"([A-Za-z0-9_]+)"', body): cmds[c] += 1
print("commands:", sorted(cmds))
for word in ["shrimp", "Shrimp", "drop", "Drop", "buyCard", "purchase", "Purchase", "checkout", "mintCard", "getMintCardInfos", "limit", "whale"]:
    for url, body in bodies.items():
        for m in list(re.finditer(word, body))[:3]:
            print(f"[{word}] {url.rsplit('/',1)[-1][:40]}: ...{body[max(0,m.start()-160):m.end()+220]!r}")
