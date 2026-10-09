# One-off research: how past DOLZ auction prizes were withdrawn (public chain data + public frontend code).
import json, urllib.request, time, re
RPCS = ["https://polygon.gateway.tenderly.co", "https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"]
UA = {"user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36"}
CUR = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
CREATED = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"
def rpc(method, params, tries=6):
    for i in range(tries):
        url = RPCS[i % len(RPCS)]
        try:
            req = urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(), headers={"content-type": "application/json", **UA})
            r = json.loads(urllib.request.urlopen(req, timeout=60).read())
            if "error" in r: raise RuntimeError(str(r["error"])[:150])
            return r["result"]
        except Exception as e:
            print("  rpc retry", method, url[:30], e); time.sleep(1 + i)
    raise RuntimeError("rpc failed")
def call(to, data):
    try: return rpc("eth_call", [{"to": to, "data": data}, "latest"])
    except Exception as e: return f"ERR {e}"
def get(url):
    try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")
    except Exception as e: return ""
# --- frontend: every backend command name, and the auction page code around withdraw/proof
main = get("https://dolz.io/static/js/main.f0a2dbee.js")
i = main.find('"static/js/"+'); seg = main[i:i + 60000]
ids = re.findall(r'(\d+):"([0-9a-f]{8})"', seg); names = dict(re.findall(r'(\d+):"([a-zA-Z0-9_-]+)"', seg[:20000]))
cmds = set(re.findall(r'command:"([a-zA-Z_]+)"', main))
for cid, h in ids:
    name = names.get(cid, cid)
    if "syntax" in name: continue
    js = get(f"https://dolz.io/static/js/{name}.{h}.chunk.js")
    cmds |= set(re.findall(r'command:"([a-zA-Z_]+)"', js))
    if re.search(r'getHashRoot|functionName:"withdraw"|getHexProof|alreadyBidded|updateBid', js):
        print(f"\n######## AUCTION chunk {name}")
        for m in list(re.finditer(r'functionName:"withdraw"|getHashRoot|command:"[a-zA-Z_]*"|getHexProof|keccak|encodePacked|encodeAbiParameters', js))[:40]:
            print("  >>", js[max(0, m.start() - 600): m.end() + 600].replace("\n", " "))
print("\nALL COMMANDS", sorted(cmds))
