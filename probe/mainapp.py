# One-off research: how the dolz.io main app calls its NFT commands (base URL, headers, response use) and its market routes.
import urllib.request, re
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception: return ""
html = get("https://dolz.io/")
srcs = re.findall(r'src="([^"]+\.js[^"]*)"', html)
print("scripts", srcs)
body = "".join(get("https://dolz.io" + s if s.startswith("/") else s) for s in srcs)
# lazy chunks too
for s in set(re.findall(r'"((?:/|static/|assets/)[A-Za-z0-9_\-./]+\.js)"', body)):
    body += get("https://dolz.io" + (s if s.startswith("/") else "/" + s))
print("js", len(body))
for k in ["getNFTsForAttributes", "getUserNFTs", "getNFTInfos\"", "Not revealed", "revealed", "marketplace"]:
    ms = list(re.finditer(re.escape(k), body)); print(f"\n### {k}: {len(ms)}")
    for m in ms[:3]: print(body[max(0, m.start()-700): m.end()+500].replace("\n", " "), "\n")
print("\nroutes:", sorted(set(re.findall(r'path:"(/[^"]*)"', body)))[:120])
print("hosts:", sorted(set(re.findall(r'https://[a-z0-9.\-]+\.[a-z]{2,}', body))))
