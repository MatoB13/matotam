# One-off research: the g0201 sale contract's getters that take an argument (price per card etc.).
import urllib.request, json
def rpc(m, p):
    r = json.loads(urllib.request.urlopen(urllib.request.Request("https://polygon.gateway.tenderly.co", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(), headers={"content-type": "application/json", "user-agent": "x"}), timeout=60).read())
    return r.get("result", r.get("error"))
S = "0x56b199b39bfa1d6fff8c363a7116ee34274a747e"
args = {"1": "1".rjust(64, "0"), "3": "3".rjust(64, "0"), "hot": "115ec4f0cb8fc4515fb9e172df97da5d463dd6f6".rjust(64, "0"), "0": "0" * 64}
for sel in ["2899a783", "37b766a5", "583970fb", "6f0ed2a3", "a51758d8", "f9ac6935", "fa87b47f"]:
    for name, a in args.items():
        print(sel, name, str(rpc("eth_call", [{"to": S, "data": "0x" + sel + a}, "latest"]))[:220])
# the public mint's revert reasons for wrong amounts (time moved to the sale, state at the block before it)
buyer = "0x5b8f56d0f2cc745765c090fb756677e46163e3c9"
for qty, amount in [(1, 1349), (1, 1350), (1, 1351), (1, 1350 * 10**18), (2, 2700), (4, 5400)]:
    data = "0xccbfc08b" + hex(qty)[2:].rjust(64, "0") + hex(amount)[2:].rjust(64, "0")
    print("mint", qty, amount, str(rpc("eth_call", [{"from": buyer, "to": S, "data": data, "gas": hex(1_500_000)}, hex(93905690), {}, {"time": hex(1789563601)}]))[:200])
# the whitelist mint with a wrong proof, for its revert text
data = "0xf2f3a93a" + "1".rjust(64, "0") + "60".rjust(64, "0") + hex(1350)[2:].rjust(64, "0") + "0" * 64
print("wl mint (empty proof)", str(rpc("eth_call", [{"from": buyer, "to": S, "data": data, "gas": hex(1_500_000)}, hex(93848100), {}, {"time": hex(1789477210)}]))[:200])
