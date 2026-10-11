# One-off research: how the dolz.io app calls its sale commands, and what the public ones return.
import urllib.request, re, json
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": "Mozilla/5.0"}), timeout=30).read().decode("utf-8", "replace")
html = get("https://dolz.io/")
srcs = ["https://dolz.io" + s if s.startswith("/") else s for s in re.findall(r'src="([^"]+\.js[^"]*)"', html)]
body = "\n".join(get(s) for s in srcs if "main" in s) or "\n".join(get(s) for s in srcs)
for cmd in ["presaleUser", "getSaleSettings", "getMintPlanning", "getWhitelistForCard", "nonceVerifier", "rootSign"]:
    for m in list(re.finditer(cmd, body))[:2]:
        print(f"\n=== {cmd} ===\n{body[max(0, m.start()-900):m.end()+900]}")
def api(payload):
    req = urllib.request.Request("https://back.dolz.io/api.php", data=json.dumps(payload).encode(), headers={"content-type": "application/json", "user-agent": "Mozilla/5.0", "origin": "https://dolz.io"})
    try:
        return urllib.request.urlopen(req, timeout=30).read().decode()[:3000]
    except Exception as e:
        return repr(e)
for cmd in ["getSaleSettings", "getMintPlanning", "getAllSeasonsPlanning"]:
    print(f"\n### {cmd}:", api({"command": cmd}))
