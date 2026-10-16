# One-off research: Cometh marketplace API (public key from the dolz.io marketplace bundle) for revealed g0207 cards.
K="apikey: jiQMsnsP86vV3Y3X2CsYV0rmmwHIrl5z"; B=https://api.marketplace.cometh.io/v1; NFT=0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc
echo | openssl s_client -connect api.marketplace.cometh.io:443 -servername api.marketplace.cometh.io 2>/dev/null | openssl x509 -noout -issuer -subject -dates
getent hosts api.marketplace.cometh.io
for id in 106215 106219 106017 105000; do echo "== $id"; curl -sS -m 20 -H "$K" -H "origin: https://dolz.io" $B/assets/$NFT/$id | head -c 2500; echo; done
echo "== search g0207"
curl -sS -m 20 -H "$K" -H "content-type: application/json" -X POST $B/assets/search -d "{\"contractAddress\":\"$NFT\",\"attributes\":[{\"Card Number\":[\"g0207\"]}],\"limit\":3}" | head -c 3000; echo
echo "== orders search"
curl -sS -m 20 -H "$K" -H "content-type: application/json" -X POST $B/orders/search -d "{\"tokenAddress\":\"$NFT\",\"tokenIds\":[\"106215\"],\"limit\":2}" | head -c 1500; echo
