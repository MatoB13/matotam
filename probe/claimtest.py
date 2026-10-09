# One-off check: does the sniper's withdraw proof builder produce a call the auction contract accepts?
# Simulation only (eth_call), for public claims of other winners. Nothing is signed or sent.
import sys, json
sys.path.insert(0, "probe/bot")
import dolz_sniper as d
C = "0x9e8c5bb7a649a77e80e04300916cd85f3304bb69"
bids = d.dolz_backend({"command": "getContractBids", "contractAddress": C})
bidders = sorted({b["bidder"].lower() for b in bids})
found = []
for a in bidders:
    e = d._safe(lambda: d.auction_claim_entry(C, a))
    if e: found.append(e)
    if len(found) >= 3: break
print("claims tested", [(e["claimer"], e["token_ids"], e["refund"]) for e in found])
print("hot", d.auction_claim_entry(C, "0x115ec4f0cb8fc4515fb9e172df97da5d463dd6f6"))
for e in found:
    calls, count, root = d.auction_withdraw_calls(C, e)
    print("claimer", e["claimer"], "claims", count, "root", root, "candidates matching root", [n for n, _ in calls])
    for name, data in calls:
        try:
            d.rpc("eth_call", [{"from": e["claimer"], "to": C, "data": data}, "latest"]); print("  SIM OK", name); break
        except Exception as x: print("  sim fail", name, str(x)[:160])
