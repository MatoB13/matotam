# One-off research of the DOLZ auction contract (public chain data only).
import json, urllib.request, time, sys
A = "0x9e8c5bb7a649a77e80E04300916cD85f3304bb69"
BS = "https://polygon.blockscout.com/api/v2"
def get(url):
    for i in range(6):
        try:
            req = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "Mozilla/5.0 dolz-probe"})
            return json.loads(urllib.request.urlopen(req, timeout=30).read())
        except Exception as e:
            print("retry", url, e); time.sleep(3 * (i + 1))
    return {}
def show_contract(addr):
    d = get(f"{BS}/smart-contracts/{addr}")
    print("== contract", addr, d.get("name"), "verified", d.get("is_verified"), "impl", d.get("implementations"))
    for x in d.get("abi") or []:
        if x["type"] in ("function", "event"):
            print(" ", x["type"], x.get("name"), [(i["type"], i.get("name")) for i in x.get("inputs", [])], "->", [(o["type"], o.get("name")) for o in x.get("outputs", [])], x.get("stateMutability", ""))
    src = d.get("source_code") or ""
    for f in d.get("additional_sources") or []:
        if "openzeppelin" not in f.get("file_path", "").lower():
            src += "\n// FILE " + f["file_path"] + "\n" + f["source_code"]
    print("== source chars", len(src))
    print(src[:60000])
    return d
d = show_contract(A)
for impl in d.get("implementations") or []:
    show_contract(impl.get("address_hash") or impl.get("address"))
t = get(f"{BS}/addresses/{A}/transactions")
print("== recent txs")
for x in (t.get("items") or [])[:40]:
    print(x["timestamp"], x["from"]["hash"], x.get("method"), x["raw_input"][:330], x["status"])
l = get(f"{BS}/addresses/{A}/logs")
print("== recent logs")
for x in (l.get("items") or [])[:25]:
    print(x["block_number"], (x.get("decoded") or {}).get("method_call"), x["topics"], x["data"][:330])
tt = get(f"{BS}/addresses/{A}/token-transfers")
print("== token transfers")
for x in (tt.get("items") or [])[:15]:
    print(x["timestamp"], x["from"]["hash"], x["to"]["hash"], (x.get("token") or {}).get("symbol"), (x.get("total") or {}).get("value"), x.get("method"))
