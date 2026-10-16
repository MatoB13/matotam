# One-off research: the dolz.io marketplace's server-rendered pages, searched for a revealed g0207 card's rarity.
import urllib.request, re
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
def get(url, rsc=False):
    h = {"user-agent": "Mozilla/5.0"}
    if rsc: h["RSC"] = "1"
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=25)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), ""
s, html = get("https://dolz.io/marketplace")
links = sorted(set(re.findall(r'href="(/marketplace[^"]*)"', html)))
print("links:", links[:60])
print("hrefs with ids:", sorted(set(re.findall(r'(/[a-zA-Z\-/]*\d{5,6}[^"\\ ]*)', html)))[:30])
for k in ["g0207", "Limited", "Not revealed", "106"]:
    for m in list(re.finditer(k, html))[:2]:
        print(f"[{k}]", html[max(0, m.start()-250): m.end()+250].replace("\n", " "))
for path in ["/marketplace/nft/106215", "/marketplace/106215", f"/marketplace/{NFT}/106215", "/marketplace/card/106215",
             "/marketplace/token/106215", "/marketplace/item/106215", "/marketplace/g0207", "/marketplace/card/g0207",
             "/marketplace?card=g0207", "/marketplace?search=g0207", "/nft/106215", f"/nft/{NFT}/106215"]:
    for rsc in (False, True):
        st, b = get("https://dolz.io" + path, rsc)
        hits = [b[max(0, m.start()-200): m.end()+300].replace("\n", " ") for m in list(re.finditer("106215|[Rr]arity", b))[:3]]
        print(path, "rsc" if rsc else "html", st, len(b), hits)
