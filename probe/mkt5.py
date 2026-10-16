# One-off research: the dolz.io marketplace shell and all its scripts, searched for the client-side data source.
import urllib.request, re
def get(url):
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        return ""
html = get("https://dolz.io/marketplace")
print(html[:9000])
srcs = sorted(set(re.findall(r'(?:src|href)="([^"]+\.js)"', html)) | set(re.findall(r'"(/marketplace/_next/static/[^"]+\.js)"', html)) | set(re.findall(r'(static/chunks/[^"\\]+\.js)', html)))
print("\nSCRIPTS", srcs)
body = ""
for s in srcs:
    u = s if s.startswith("http") else "https://dolz.io" + (s if s.startswith("/") else "/marketplace/_next/" + s)
    b = get(u); print(u, len(b)); body += "\n" + b
wp = [s for s in srcs if "webpack" in s]
if wp:
    w = get("https://dolz.io" + wp[0])
    print("\nWEBPACK tail", w[-3000:])
for pat in [r'fetch\([^)]{0,200}\)', r'NEXT_PUBLIC_[A-Z_]+', r'"https?://[^"]+"', r'graphql|supabase|firebase|algolia|hasura|moralis|alchemy|thegraph|reservoir']:
    print("\n", pat, sorted(set(re.findall(pat, body)))[:50])
