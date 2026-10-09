# One-off research: which dolz.io API the "Withdraw prizes" button calls (public frontend code only).
import re, urllib.request
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")
    except Exception as e: print("GET fail", url, e); return ""
page = get("https://dolz.io/auction/0x9e8c5bb7a649a77e80E04300916cD85f3304bb69")
scripts = sorted(set(re.findall(r'(?:src)="([^"]+\.js[^"]*)"', page)))
print("scripts", scripts)
for s in scripts:
    js = get(s if s.startswith("http") else "https://dolz.io" + s)
    chunks = re.findall(r'"static/js/"\+[^;]{0,400}', js)
    print("chunk map", chunks[:2])
    print("API-ish urls", sorted(set(re.findall(r'https?://[a-zA-Z0-9.-]*(?:dolz|api)[a-zA-Z0-9./_-]*', js)))[:40])
    for pat in [r'Withdraw prizes', r'withdraw[A-Z][a-zA-Z]*', r'hashRoot|HashRoot', r'"withdraw"', r'/auctions?/[^"`]{0,60}', r'proof']:
        found = [m for m in re.finditer(pat, js)]
        print(f"\n### {pat}: {len(found)}")
        for m in found[:6]:
            ctx = js[max(0, m.start() - 400): m.end() + 400]
            if pat == 'proof' and not re.search(r'(?i)withdraw|auction|prize', ctx): continue
            print("  >>", ctx.replace("\n", " "))
