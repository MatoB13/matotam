# One-off research: how the dolz.io frontend signs in a wallet through Privy and registers it (public frontend code).
import re, urllib.request
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36"}
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")
    except Exception: return ""
page = get("https://dolz.io/")
main_src = re.findall(r'src="(/static/js/main\.[0-9a-f]+\.js)"', page)
main = get("https://dolz.io" + main_src[0])
for pat in [r'privyLogin', r'appId\s*:\s*"[a-z0-9]{20,}"', r'PrivyProvider', r'checkWalletValidity', r'loginMethods', r'checkWalletLinkedWithLogin']:
    for m in list(re.finditer(pat, main))[:2]:
        print(f"\n=== {pat}\n", main[max(0, m.start() - 1200): m.end() + 1500].replace("\n", " "))
print("\nAPP IDS", set(re.findall(r'"(cl[a-z0-9]{20,})"', main)))
