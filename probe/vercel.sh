# One-off timing of the dashboard's routes on Vercel without a token (401 answers: routing and cold start only).
for i in 1 2 3; do
  for p in "api/version" "api/dolz/sniper?view=arbitrage" "api/dolz/sell?market=0" "api/dolz/sniper"; do
    curl -sS -m 120 -o /dev/null -w "$i $p %{http_code} %{time_total}s\n" "https://dolz.matotam.io/$p"
  done
done
curl -sS -m 60 -o /dev/null -w "page %{http_code} %{time_total}s %{size_download}B\n" "https://dolz.matotam.io/"
