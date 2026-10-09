"""DOLZ marketplace sniper.

Watches the DOLZ marketplace on Polygon for new and repriced listings and buys
the ones that match the configured rules, from a dedicated hot wallet.

How the marketplace works on chain:
- DolzMarketplaceListingManager emits Listed / ListingUpdated / ListingCancelled
  with the seller, NFT contract, token id, price, currency and expiration.
- DolzMarketplaceSalesManager.buyNFT(nftAddress, tokenId, price) buys a listing;
  it pulls the price in the listing currency (USDC since 2026-09-23) from the
  buyer, so the hot wallet approves USDC to the SalesManager.

Every purchase is simulated with eth_estimateGas first, so a listing that is
already sold, cancelled or repriced costs nothing.

Settings live in the dolz_sniper_config table and are edited on the DOLZ
dashboard (matotam.io/dolz, Sniper tab); the bot re-reads them every few
seconds. Each rule is a card (or any card), a minimum rarity (Rare also covers
Epic and Legendary, Epic covers Legendary) and a maximum price in USD.

Offers on the hot wallet's cards (OffersManager.makeOffer) are shown there too
and can be accepted (SalesManager.acceptOffer) or rejected; a new offer on a
card the wallet holds is announced on Discord.

The same API also lists the hot wallet's cards for sale (Predaj tab):
ListingManager.listNFT / updateListing / cancelListing in USDC. Sellers approve
their NFTs (setApprovalForAll) to the marketplace payment proxy, like buyers
approve USDC to it.

Environment (Railway service dolz-sniper, start command `python dolz_sniper.py`):
  DOLZ_SNIPER_PRIVATE_KEY        hot wallet private key (required)
  DATABASE_URL                   Postgres shared with the dashboard
  DOLZ_SNIPER_HARD_MAX_PRICE_USD safety cap no dashboard setting can exceed (default 200)
  DOLZ_SNIPER_POLL_SECONDS       default 3
  DOLZ_SNIPER_BACKFILL_BLOCKS    listing events to replay at startup (default 1800, ~1 hour)
  DOLZ_SNIPER_SCAN_HOURS         how far back the active-listing scan looks (default 1; new listings are caught live)
  DOLZ_SNIPER_RPC_URLS           comma separated, default Tenderly + publicnode
  DOLZ_SNIPER_PRIORITY_GWEI      minimum priority fee (default 40)
  PORT                           HTTP port of the dashboard API (Railway sets it)
  DOLZ_SNIPER_API_TOKEN_SHA256   SHA-256 of the dashboard token allowed to use the API
  DOLZ_SNIPER_ACTION_PASSWORD    password the dashboard must send for buys, offers, listings, transfers and settings
  DOLZ_SNIPER_OWNER_WALLETS      owner's wallets counted in Chýbajúce karty, besides the hot wallet (default: main + dolz.io wallet)
  DOLZ_SNIPER_TRANSFER_TO        comma separated addresses cards may be moved to (default: the owner's main wallet)
  DISCORD_WEBHOOK_URL            optional Discord notifications
  STRIKEBOT_PUSH_NOTIFY_URL / STRIKEBOT_PUSH_NOTIFY_SECRET  optional push notifications
"""

import hashlib
import hmac
import json
import os
import re
import threading
import time
import traceback
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import contextmanager
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from eth_account import Account
from eth_utils import keccak, to_checksum_address

load_dotenv()

LISTING_MANAGER = "0x3d7a352796a8c0d8bbd6b2c3cb95f129e94a763d"
SALES_MANAGER = "0xe7693ba9cf616a55b88f3ca7b74db3358b5767ee"
# The marketplace pulls the payment through this proxy (not SalesManager); buyers approve USDC to it.
PAYMENT_SPENDER = "0xff1162ede44d5fd3ef893314b022855a8c1c0ae8"
DOLZ_NFT = "0xd27029e4ebc3c4c55fcfadddc54fa0b911829afc"
USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
CHAIN_ID = 137

TOPIC_LISTED = "0x" + keccak(text="Listed(address,address,uint256,uint256,address,uint256,uint256)").hex().removeprefix("0x")
TOPIC_UPDATED = "0x" + keccak(text="ListingUpdated(address,address,uint256,uint256,address,uint256,uint256)").hex().removeprefix("0x")
TOPIC_CANCELLED = "0x" + keccak(text="ListingCancelled(address,address,uint256)").hex().removeprefix("0x")
SEL_OWNER_OF = keccak(text="ownerOf(uint256)")[:4].hex()
# Listings older than this are not considered active (USDC pricing started 2026-09-23).
# The live loop catches every new listing, so the scan (start, new settings, button) only needs the recent ones.
SCAN_HOURS = float(os.getenv("DOLZ_SNIPER_SCAN_HOURS", "1"))
BLOCKS_PER_DAY = 43_200
RESCAN_REQUESTED = threading.Event()

SEL_BUY_NFT = keccak(text="buyNFT(address,uint256,uint256)")[:4].hex()
SEL_APPROVE = keccak(text="approve(address,uint256)")[:4].hex()
SEL_ALLOWANCE = keccak(text="allowance(address,address)")[:4].hex()
SEL_BALANCE_OF = keccak(text="balanceOf(address)")[:4].hex()
SEL_TOKEN_URI = keccak(text="tokenURI(uint256)")[:4].hex()
SEL_LIST_NFT = keccak(text="listNFT(address,uint256,uint256,address,uint256)")[:4].hex()
SEL_UPDATE_LISTING = keccak(text="updateListing(address,uint256,uint256,address,uint256)")[:4].hex()
SEL_CANCEL_LISTING = keccak(text="cancelListing(address,uint256)")[:4].hex()
SEL_SET_APPROVAL_FOR_ALL = keccak(text="setApprovalForAll(address,bool)")[:4].hex()
SEL_IS_APPROVED_FOR_ALL = keccak(text="isApprovedForAll(address,address)")[:4].hex()
SEL_SAFE_TRANSFER_FROM = keccak(text="safeTransferFrom(address,address,uint256)")[:4].hex()
# Offers: made on the OffersManager, stored in the marketplace (PAYMENT_SPENDER), accepted on the SalesManager.
OFFERS_MANAGER = "0xb98dc01173463225ea7fdbf99c9211107e55d493"
TOPIC_OFFER_MADE = "0x" + keccak(text="OfferMade(address,address,uint256,uint256,address,uint256,uint256)").hex().removeprefix("0x")
TOPIC_OFFER_UPDATED = "0x" + keccak(text="OfferUpdated(address,address,uint256,uint256,uint256,uint256)").hex().removeprefix("0x")
SEL_GET_LISTING = keccak(text="getListing(address,uint256)")[:4].hex()
SEL_GET_OFFER = keccak(text="getOffer(address,uint256,address)")[:4].hex()
SEL_IS_OFFER_FUNDABLE = keccak(text="isOfferFundable(address,uint256,address)")[:4].hex()
SEL_ACCEPT_OFFER = keccak(text="acceptOffer(address,uint256,address,uint256)")[:4].hex()
SEL_MAKE_OFFER = keccak(text="makeOffer(address,uint256,uint256,address,uint256)")[:4].hex()
SEL_UPDATE_OFFER = keccak(text="updateOffer(address,uint256,uint256,uint256)")[:4].hex()
SEL_CANCEL_OFFER = keccak(text="cancelOffer(address,uint256)")[:4].hex()
TOPIC_OFFER_ACCEPTED = "0x" + keccak(text="OfferAccepted(address,address,address,uint256,uint256,address,uint256)").hex().removeprefix("0x")
SEL_REJECT_OFFER = keccak(text="rejectOffer(address,uint256,address)")[:4].hex()
SEL_PLATFORM_FEE_BPS = keccak(text="getPlatformFeeBasisPoints(address)")[:4].hex()
SEL_COLLECTION_FEE_BPS = keccak(text="getCollectionFeeBasisPoints(address)")[:4].hex()
TOPIC_TRANSFER = "0x" + keccak(text="Transfer(address,address,uint256)").hex().removeprefix("0x")
# Durations the DOLZ market offers when listing a card, in days.
SELL_DURATIONS_DAYS = (1, 2, 3, 7, 30, 90, 180)
SELL_LOOKBACK_DAYS = 200
# Offers usually run for days; an older one that is still open would need a longer window.
OFFER_LOOKBACK_DAYS = int(os.getenv("DOLZ_SNIPER_OFFER_LOOKBACK_DAYS", "30"))



DATABASE_URL = os.getenv("DATABASE_URL")
PRIVATE_KEY = os.getenv("DOLZ_SNIPER_PRIVATE_KEY", "").strip()
RPC_URLS = [u.strip() for u in os.getenv(
    "DOLZ_SNIPER_RPC_URLS", "https://polygon.gateway.tenderly.co,https://polygon-bor-rpc.publicnode.com"
).split(",") if u.strip()]
HARD_MAX_PRICE_USD = float(os.getenv("DOLZ_SNIPER_HARD_MAX_PRICE_USD", "200"))
POLL_SECONDS = float(os.getenv("DOLZ_SNIPER_POLL_SECONDS", "3"))
BACKFILL_BLOCKS = int(os.getenv("DOLZ_SNIPER_BACKFILL_BLOCKS", "1800"))
PRIORITY_GWEI = float(os.getenv("DOLZ_SNIPER_PRIORITY_GWEI", "40"))
MAX_LOG_SPAN = 2000


def log(message):
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {message}", flush=True)


# ---------------------------------------------------------------------------
# Settings and rules

RARITY_RANK = {"limited": 1, "rare": 2, "epic": 3, "legendary": 4}
MAX_RULES = 20

DEFAULT_CONFIG = {
    "enabled": True,
    "dry_run": False,
    "daily_budget_usd": 50,
    "max_buys_per_day": 20,
    "rules": [{"enabled": True, "card": None, "min_rarity": None, "max_price": 9, "max_serial": None}],
}


def normalize_config(raw):
    config = {**DEFAULT_CONFIG, **(raw or {})}
    rules = []
    for index, rule in enumerate((config.get("rules") or [])[:MAX_RULES]):
        try:
            max_price = float(rule.get("max_price"))
        except (TypeError, ValueError):
            continue
        if max_price <= 0 or rule.get("enabled") is False:
            continue
        card = (rule.get("card") or "").strip().lower() or None
        rarity = (rule.get("min_rarity") or "").strip().lower() or None
        if rarity not in (None, *RARITY_RANK):
            rarity = None
        max_serial = rule.get("max_serial")
        season = season_key(rule.get("season"))
        rules.append({
            "name": rule.get("name") or describe_rule(card, rule.get("card_name"), rarity, max_price, max_serial, season),
            "card": card,
            "min_rarity": rarity,
            "season": season,
            "max_price": min(max_price, HARD_MAX_PRICE_USD),
            "max_serial": int(max_serial) if max_serial not in (None, "") else None,
        })
    config["rules"] = rules
    config["daily_budget_usd"] = float(config.get("daily_budget_usd") or 0)
    config["max_buys_per_day"] = int(config.get("max_buys_per_day") or 0)
    config["enabled"] = bool(config.get("enabled"))
    config["dry_run"] = bool(config.get("dry_run"))
    return config


def season_key(value):
    """Season as cards carry it ("1" … "11", "Special Edition", "Off-Season", "OG"); "Season 1" or 1 become "1".
    None means any season."""
    text = str(value or "").strip()
    if not text:
        return None
    number = re.fullmatch(r"(?:season\s*)?(\d+)", text, re.IGNORECASE)
    return str(int(number.group(1))) if number else text[:40]


def describe_rule(card, card_name, rarity, max_price, max_serial, season=None):
    parts = [card_name or (card.upper() if card else "akákoľvek karta")]
    if season:
        parts.append(f"S{season}" if season.isdigit() else season)
    parts.append(f"{rarity.capitalize()}+" if rarity else "akákoľvek rarita")
    if max_serial:
        parts.append(f"#≤{max_serial}")
    return f"{' · '.join(parts)} do ${max_price:g}"


def rule_matches(rule, price_usd, card):
    if price_usd > rule["max_price"]:
        return False
    if rule["card"] and (card.get("card") or "").lower() != rule["card"]:
        return False
    if rule["min_rarity"]:
        rank = RARITY_RANK.get((card.get("rarity") or "").lower(), 0)
        if rank < RARITY_RANK[rule["min_rarity"]]:
            return False
    if rule.get("season") and (season_key(card.get("season")) or "").lower() != rule["season"].lower():
        return False
    if rule["max_serial"] is not None and (card.get("serial") is None or card["serial"] > rule["max_serial"]):
        return False
    return True


def first_matching_rule(rules, price_usd, card):
    for rule in rules:
        if rule_matches(rule, price_usd, card):
            return rule
    return None


# ---------------------------------------------------------------------------
# JSON-RPC

def rpc(method, params, urls=None):
    last_error = None
    for url in urls or RPC_URLS:
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        request = urllib.request.Request(url, data=body, headers={"content-type": "application/json", "user-agent": "dolz-sniper"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.loads(response.read())
            if "error" in data:
                last_error = RuntimeError(f"{method} at {url}: {data['error']}")
                # A revert is the chain's answer, not a node problem: don't try other nodes.
                if method in ("eth_estimateGas", "eth_call", "eth_sendRawTransaction"):
                    raise last_error
                continue
            return data["result"]
        except RuntimeError:
            raise
        except Exception as exc:
            last_error = exc
    raise last_error or RuntimeError(f"{method} failed")


def word(value):
    return format(value, "064x")


def addr_word(address):
    return address.lower().removeprefix("0x").rjust(64, "0")


def eth_call(to, data):
    return rpc("eth_call", [{"to": to, "data": data}, "latest"])


# ---------------------------------------------------------------------------
# Card metadata

_meta_cache = {}


def fetch_json(url):
    request = urllib.request.Request(url, headers={"user-agent": "dolz-sniper", "accept": "application/json"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read())


def parse_metadata(meta):
    attrs = {a.get("trait_type"): a.get("value") for a in meta.get("attributes", []) if isinstance(a, dict)}
    serial_text = str(attrs.get("Serial Number") or "")
    serial, tier = (serial_text.split("/", 1) + [None])[:2] if "/" in serial_text else (None, None)
    try:
        serial_number = int(serial) if serial else None
    except ValueError:
        serial_number = None
    return {
        "name": meta.get("name"),
        "card": attrs.get("Card Number"),
        "tier": tier,
        "serial": serial_number,
        "rarity": attrs.get("Rarity"),
        "season": attrs.get("Season"),
    }


def ipfs_http(uri):
    return "https://ipfs.io/ipfs/" + uri[7:] if isinstance(uri, str) and uri.startswith("ipfs://") else uri


def card_metadata(token_id, fetch=True):
    """Card attributes. Cards never change, so they are cached in memory and in dolz_sniper_cards.
    With fetch=False only the caches are read (None when the card was never fetched)."""
    if token_id in _meta_cache:
        return _meta_cache[token_id]
    try:
        with db_cursor() as cur:
            cur.execute("SELECT card FROM dolz_sniper_cards WHERE token_id = %s", (token_id,))
            row = cur.fetchone()
        if row and row[0].get("rarity"):
            _meta_cache[token_id] = row[0]
            return row[0]
    except Exception as exc:
        log(f"card cache read failed for #{token_id}: {exc!r}")
    if not fetch:
        return None
    meta = None
    image = None
    # Blockscout first: it answers in well under a second, ipfs.io can take tens of seconds.
    try:
        instance = fetch_json(f"https://polygon.blockscout.com/api/v2/tokens/{DOLZ_NFT}/instances/{token_id}")
        meta = instance.get("metadata") or None
        image = instance.get("image_url")
    except Exception as exc:
        log(f"blockscout metadata failed for #{token_id}: {exc!r}")
    if meta is None:
        try:
            raw = eth_call(DOLZ_NFT, "0x" + SEL_TOKEN_URI + word(token_id))
            data = bytes.fromhex(raw[2:])
            length = int.from_bytes(data[32:64], "big")
            meta = fetch_json(ipfs_http(data[64:64 + length].decode()))
        except Exception as exc:
            log(f"tokenURI metadata failed for #{token_id}: {exc!r}")
    if not meta:
        return {"name": None, "card": None, "tier": None, "serial": None, "rarity": None, "season": None, "image": None}
    card = {**parse_metadata(meta), "image": image or ipfs_http(meta.get("image"))}
    _meta_cache[token_id] = card
    try:
        with db_cursor() as cur:
            cur.execute(
                "INSERT INTO dolz_sniper_cards (token_id, card) VALUES (%s, %s) "
                "ON CONFLICT (token_id) DO UPDATE SET card = EXCLUDED.card, updated_at = NOW()",
                (token_id, psycopg2.extras.Json(card)),
            )
    except Exception as exc:
        log(f"card cache write failed for #{token_id}: {exc!r}")
    return card


# ---------------------------------------------------------------------------
# Database

_connection = None
# The API thread uses the same connection for metadata and sell bookkeeping.
_db_lock = threading.RLock()


@contextmanager
def db_cursor():
    """One long-lived autocommit connection, reopened if it drops."""
    global _connection
    with _db_lock:
        if _connection is None or _connection.closed:
            _connection = psycopg2.connect(DATABASE_URL)
            _connection.autocommit = True
        try:
            with _connection.cursor() as cur:
                yield cur
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            try:
                _connection.close()
            finally:
                _connection = None
            raise


def init_db():
    with db_cursor() as cur:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS dolz_sniper_purchases (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            token_id BIGINT NOT NULL,
            price_usd NUMERIC NOT NULL,
            rule_name TEXT,
            seller TEXT,
            listing_tx TEXT,
            listing_log_index INTEGER,
            card_name TEXT,
            card_number TEXT,
            tier TEXT,
            serial INTEGER,
            rarity TEXT,
            season TEXT,
            status TEXT NOT NULL,
            tx_hash TEXT,
            error TEXT,
            dry_run BOOLEAN NOT NULL DEFAULT FALSE,
            UNIQUE (listing_tx, listing_log_index)
        )
        """)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS dolz_sniper_events (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            event_type TEXT NOT NULL,
            message TEXT,
            metadata JSONB
        )
        """)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS dolz_sniper_state (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS dolz_sniper_config (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            config JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """)
        cur.execute("""
        CREATE TABLE IF NOT EXISTS dolz_sniper_cards (
            token_id BIGINT PRIMARY KEY,
            card JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """)
        cur.execute(
            "INSERT INTO dolz_sniper_config (id, config) VALUES (1, %s) ON CONFLICT (id) DO NOTHING",
            (psycopg2.extras.Json(DEFAULT_CONFIG),),
        )


def load_config():
    with db_cursor() as cur:
        cur.execute("SELECT config, updated_at FROM dolz_sniper_config WHERE id = 1")
        row = cur.fetchone()
    return normalize_config(row[0] if row else None), (row[1].isoformat() if row else None)


def get_state(key):
    with db_cursor() as cur:
        cur.execute("SELECT value FROM dolz_sniper_state WHERE key = %s", (key,))
        row = cur.fetchone()
        return row[0] if row else None


def set_state(key, value):
    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO dolz_sniper_state (key, value, updated_at) VALUES (%s, %s, NOW()) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
            (key, str(value)),
        )


def record_event(event_type, message, metadata=None):
    log(f"[{event_type}] {message}")
    try:
        with db_cursor() as cur:
            cur.execute(
                "INSERT INTO dolz_sniper_events (event_type, message, metadata) VALUES (%s, %s, %s)",
                (event_type, message, psycopg2.extras.Json(metadata or {})),
            )
    except Exception as exc:
        log(f"event insert failed: {exc!r}")


def already_handled(listing_tx, log_index):
    with db_cursor() as cur:
        cur.execute(
            # Only real purchase attempts are final. Skipped, dry-run, missed and errored matches may be
            # retried (a listing that is gone just fails the free simulation again).
            "SELECT 1 FROM dolz_sniper_purchases WHERE listing_tx = %s AND listing_log_index = %s "
            "AND status IN ('bought', 'pending', 'unconfirmed', 'failed')",
            (listing_tx, log_index),
        )
        return cur.fetchone() is not None


def spent_today():
    with db_cursor() as cur:
        cur.execute(
            "SELECT COALESCE(SUM(price_usd), 0), COUNT(*) FROM dolz_sniper_purchases "
            "WHERE status IN ('bought', 'pending') AND dry_run = FALSE AND rule_name IS DISTINCT FROM %s AND rule_name IS DISTINCT FROM %s "
            "AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
            (MANUAL_RULE, OFFER_RULE),
        )
        total, count = cur.fetchone()
        return float(total), int(count)


def save_purchase(listing, card, rule, status, tx_hash=None, error=None, dry_run=False):
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO dolz_sniper_purchases (token_id, price_usd, rule_name, seller, listing_tx, listing_log_index,
                card_name, card_number, tier, serial, rarity, season, status, tx_hash, error, dry_run)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (listing_tx, listing_log_index) DO UPDATE
              SET status = EXCLUDED.status, tx_hash = EXCLUDED.tx_hash, error = EXCLUDED.error
            """,
            (
                listing["token_id"], listing["price_usd"], rule["name"] if rule else None, listing["seller"],
                listing["tx"], listing["log_index"], card.get("name"), card.get("card"), card.get("tier"),
                card.get("serial"), card.get("rarity"), card.get("season"), status, tx_hash, error, dry_run,
            ),
        )


# ---------------------------------------------------------------------------
# Notifications (best effort, never blocks buying)

def notify(event_type, title, message, metadata=None):
    discord = os.getenv("DISCORD_WEBHOOK_URL", "").strip()
    if discord:
        request = urllib.request.Request(
            discord,
            data=json.dumps({"content": f"**{title}**\n{message}"}).encode(),
            method="POST",
            headers={"Content-Type": "application/json", "User-Agent": "dolz-sniper"},
        )
        try:
            with urllib.request.urlopen(request, timeout=3):
                pass
        except Exception as exc:
            log(f"discord notify failed: {exc!r}")
    url = os.getenv("STRIKEBOT_PUSH_NOTIFY_URL", "").strip()
    secret = os.getenv("STRIKEBOT_PUSH_NOTIFY_SECRET", "").strip()
    if not url or not secret:
        return
    payload = {"event_type": event_type, "message": message, "metadata": {"title": title, **(metadata or {})}}
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, default=str).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "X-Strikebot-Push-Secret": secret},
    )
    try:
        with urllib.request.urlopen(request, timeout=3):
            pass
    except Exception as exc:
        log(f"push notify failed: {exc!r}")


# ---------------------------------------------------------------------------
# Transactions

class Wallet:
    def __init__(self, private_key):
        self.account = Account.from_key(private_key)
        self.address = self.account.address.lower()
        self.approved = 0
        self.lock = threading.Lock()
        self.nft_approved = False
        # USDC our open offers may pull; every re-approval keeps covering it on top of the daily budget.
        self.offer_reserve = 0

    def usdc_balance(self):
        return int(eth_call(USDC, "0x" + SEL_BALANCE_OF + addr_word(self.address)), 16)

    def pol_balance(self):
        return int(rpc("eth_getBalance", [self.address, "latest"]), 16)

    def allowance(self):
        return int(eth_call(USDC, "0x" + SEL_ALLOWANCE + addr_word(self.address) + addr_word(PAYMENT_SPENDER)), 16)

    def fees(self, min_priority_gwei=None):
        block = rpc("eth_getBlockByNumber", ["latest", False])
        base_fee = int(block.get("baseFeePerGas", "0x0"), 16)
        try:
            suggested = int(rpc("eth_maxPriorityFeePerGas", []), 16)
        except Exception:
            suggested = 0
        priority = max(suggested, int(max(PRIORITY_GWEI, min_priority_gwei or 0) * 1e9))
        return base_fee * 2 + priority, priority

    def send(self, to, data, gas=None, priority_gwei=None):
        # Buying (main loop) and listing (API thread) share the nonce.
        with self.lock:
            return self._send(to, data, gas, priority_gwei)

    def _send(self, to, data, gas=None, priority_gwei=None):
        tx = {"from": self.address, "to": to, "data": data, "value": "0x0"}
        estimated = int(rpc("eth_estimateGas", [tx]), 16) if gas is None else gas
        max_fee, priority = self.fees(priority_gwei)
        nonce = int(rpc("eth_getTransactionCount", [self.address, "pending"]), 16)
        signed = self.account.sign_transaction({
            "chainId": CHAIN_ID,
            "nonce": nonce,
            "to": to_checksum_address(to),
            "value": 0,
            "data": data,
            "gas": int(estimated * 1.25) + 10_000,
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": priority,
            "type": 2,
        })
        raw = getattr(signed, "raw_transaction", None) or signed.rawTransaction
        return rpc("eth_sendRawTransaction", ["0x" + raw.hex().removeprefix("0x")])

    def wait(self, tx_hash, timeout=90, poll=2):
        deadline = time.time() + timeout
        while time.time() < deadline:
            receipt = rpc("eth_getTransactionReceipt", [tx_hash])
            if receipt:
                return int(receipt["status"], 16) == 1
            time.sleep(poll)
        return None

    def ensure_allowance(self, amount, budget_usd):
        if self.approved >= amount:
            return
        current = self.allowance()
        if current >= amount:
            self.approved = current
            return
        target = max(int(budget_usd * 1e6) + self.offer_reserve, amount)
        data = "0x" + SEL_APPROVE + addr_word(PAYMENT_SPENDER) + word(target)
        tx_hash = self.send(USDC, data)
        record_event("APPROVE", f"USDC approve {target / 1e6:.2f} pre DOLZ market", {"tx": tx_hash})
        if not self.wait(tx_hash):
            raise RuntimeError(f"USDC approve failed or timed out: {tx_hash}")
        self.approved = target

    def spent(self, amount):
        """A purchase used `amount` of the USDC allowance (the chain lowers it on every transferFrom)."""
        self.approved = max(0, self.approved - amount)

    def ensure_nft_approval(self):
        """Sellers approve their cards to the marketplace payment proxy, which moves them on a sale."""
        if self.nft_approved:
            return
        data = "0x" + SEL_IS_APPROVED_FOR_ALL + addr_word(self.address) + addr_word(PAYMENT_SPENDER)
        if int(eth_call(DOLZ_NFT, data), 16) == 0:
            tx_hash = self.send(DOLZ_NFT, "0x" + SEL_SET_APPROVAL_FOR_ALL + addr_word(PAYMENT_SPENDER) + word(1))
            record_event("APPROVE_NFT", "DolzNFT setApprovalForAll pre DOLZ market (predaj)", {"tx": tx_hash})
            if not self.wait(tx_hash):
                raise RuntimeError(f"NFT approval failed or timed out: {tx_hash}")
        self.nft_approved = True


# ---------------------------------------------------------------------------
# Listings

def decode_listing(log_entry):
    data = bytes.fromhex(log_entry["data"][2:])
    price = int.from_bytes(data[0:32], "big")
    currency = "0x" + data[44:64].hex()
    expiration = int.from_bytes(data[64:96], "big")
    return {
        "event": "Listed" if log_entry["topics"][0] == TOPIC_LISTED else "ListingUpdated",
        "seller": "0x" + log_entry["topics"][1][-40:],
        "nft": "0x" + log_entry["topics"][2][-40:],
        "token_id": int(log_entry["topics"][3], 16),
        "price_raw": price,
        "currency": currency.lower(),
        "price_usd": price / 1e6,
        "expiration": expiration,
        "tx": log_entry["transactionHash"].lower(),
        "log_index": int(log_entry["logIndex"], 16),
        "block": int(log_entry["blockNumber"], 16),
    }


def fetch_listings(from_block, to_block):
    logs = rpc("eth_getLogs", [{
        "address": LISTING_MANAGER,
        "fromBlock": hex(from_block),
        "toBlock": hex(to_block),
        "topics": [[TOPIC_LISTED, TOPIC_UPDATED], None, "0x" + addr_word(DOLZ_NFT)],
    }])
    return [decode_listing(entry) for entry in logs]


def fetch_listing_events(from_block, to_block, seller=None):
    """Listed / ListingUpdated / ListingCancelled logs for DolzNFT, in chain order."""
    params = {
        "address": LISTING_MANAGER,
        "topics": [
            [TOPIC_LISTED, TOPIC_UPDATED, TOPIC_CANCELLED],
            "0x" + addr_word(seller) if seller else None,
            "0x" + addr_word(DOLZ_NFT),
        ],
    }
    logs = get_logs_ranged(params, from_block, to_block)
    return sorted(logs, key=lambda entry: (int(entry["blockNumber"], 16), int(entry["logIndex"], 16)))


def owner_of(token_id):
    return "0x" + eth_call(DOLZ_NFT, "0x" + SEL_OWNER_OF + word(token_id))[-40:]


def active_listings():
    """Listings that are still open: last Listed/Updated per card, not cancelled, seller still owns it."""
    latest = int(rpc("eth_blockNumber", []), 16)
    current = {}
    for entry in fetch_listing_events(max(0, latest - int(SCAN_HOURS * BLOCKS_PER_DAY / 24)), latest):
        token_id = int(entry["topics"][3], 16)
        if entry["topics"][0] == TOPIC_CANCELLED:
            current.pop(token_id, None)
        else:
            current[token_id] = decode_listing(entry)
    now = time.time()
    return [
        listing for listing in current.values()
        if listing["currency"] == USDC and (not listing["expiration"] or listing["expiration"] > now)
    ], latest


def scan_active_listings(config, wallet, reason, heartbeat=None):
    """Buy matching listings that are already on the market (new rules, restart, or on request)."""
    if not config["enabled"] or not config["rules"]:
        return
    listings, latest = active_listings()
    max_rule_price = max(rule["max_price"] for rule in config["rules"])
    candidates = [listing for listing in listings if listing["price_usd"] <= max_rule_price]
    checked = 0
    for listing in sorted(candidates, key=lambda item: item["price_usd"]):
        if heartbeat:
            heartbeat()  # the first scan fetches metadata for every candidate and can take a while
        try:
            if owner_of(listing["token_id"]).lower() != listing["seller"].lower():
                continue  # sold or moved since it was listed
        except Exception:
            continue
        checked += 1
        handle_listing(listing, config, wallet)
    record_event(
        "DOLZ_SNIPER_SCAN",
        f"Prehľadané ponuky za posledných {SCAN_HOURS:g} h ({reason}): {len(listings)} aktívnych, {checked} v cenovom rozsahu pravidiel",
        {"active": len(listings), "candidates": checked, "latest_block": latest},
    )


def handle_listing(listing, config, wallet):
    rules = config["rules"]
    dry_run = config["dry_run"]
    if listing["currency"] != USDC or listing["nft"] != DOLZ_NFT:
        return
    if listing["seller"] == wallet.address:
        return
    if listing["expiration"] and listing["expiration"] < time.time():
        return
    if listing["price_usd"] > HARD_MAX_PRICE_USD:
        return
    # Cheap pre-filter before fetching metadata: the price must fit some rule.
    if not any(listing["price_usd"] <= rule["max_price"] for rule in rules):
        return
    if already_handled(listing["tx"], listing["log_index"]):
        return

    card = card_metadata(listing["token_id"])
    rule = first_matching_rule(rules, listing["price_usd"], card)
    if not rule:
        return

    label = f"{card.get('name') or ('#' + str(listing['token_id']))} ({card.get('card') or '?'}, {card.get('rarity') or '?'} /{card.get('tier') or '?'} #{card.get('serial') or '?'})"
    info = {"token_id": listing["token_id"], "price_usd": listing["price_usd"], "rule": rule["name"], "card": card, "listing_tx": listing["tx"]}

    if dry_run:
        save_purchase(listing, card, rule, "dry_run", dry_run=True)
        record_event("DOLZ_SNIPER_MATCH", f"[dry run] by kúpil {label} za ${listing['price_usd']:.2f} ({rule['name']})", info)
        notify("DOLZ_SNIPER_MATCH", "DOLZ sniper (dry run)", f"{label} za ${listing['price_usd']:.2f}", info)
        return

    spent, count = spent_today()
    if count >= config["max_buys_per_day"] or spent + listing["price_usd"] > config["daily_budget_usd"]:
        save_purchase(listing, card, rule, "skipped_budget")
        record_event("DOLZ_SNIPER_BUDGET", f"Denný limit: {label} za ${listing['price_usd']:.2f} preskočené (dnes ${spent:.2f}, {count} ks)", info)
        return
    if wallet.usdc_balance() < listing["price_raw"]:
        save_purchase(listing, card, rule, "skipped_balance")
        record_event("DOLZ_SNIPER_BALANCE", f"Málo USDC na {label} za ${listing['price_usd']:.2f}", info)
        notify("DOLZ_SNIPER_BALANCE", "DOLZ sniper: málo USDC", f"Nestačí na {label} za ${listing['price_usd']:.2f}", info)
        return

    try:
        wallet.ensure_allowance(listing["price_raw"], config["daily_budget_usd"])
        data = "0x" + SEL_BUY_NFT + addr_word(DOLZ_NFT) + word(listing["token_id"]) + word(listing["price_raw"])
        save_purchase(listing, card, rule, "pending")
        tx_hash = wallet.send(SALES_MANAGER, data)
        save_purchase(listing, card, rule, "pending", tx_hash=tx_hash)
        ok = wallet.wait(tx_hash)
        status = "bought" if ok else ("failed" if ok is False else "unconfirmed")
        if ok:
            wallet.spent(listing["price_raw"])
        else:
            wallet.approved = 0  # re-read the allowance from the chain before the next purchase
        save_purchase(listing, card, rule, status, tx_hash=tx_hash)
        if ok:
            record_event("DOLZ_SNIPER_BOUGHT", f"Kúpené {label} za ${listing['price_usd']:.2f} ({rule['name']})", {**info, "tx": tx_hash})
            notify("DOLZ_SNIPER_BOUGHT", "DOLZ sniper: kúpené", f"{label} za ${listing['price_usd']:.2f}\nhttps://polygonscan.com/tx/{tx_hash}", {**info, "tx": tx_hash})
        else:
            record_event("DOLZ_SNIPER_FAILED", f"Nákup {label} neprešiel ({status})", {**info, "tx": tx_hash})
    except Exception as exc:
        message = str(exc)
        if "allowance" in message.lower():
            wallet.approved = 0  # stale cached allowance: re-read and top up before the next purchase
        # A reverted simulation means someone else was faster or the listing changed.
        status = "missed" if "revert" in message.lower() or "execution" in message.lower() else "error"
        save_purchase(listing, card, rule, status, error=message[:500])
        record_event("DOLZ_SNIPER_MISSED" if status == "missed" else "DOLZ_SNIPER_ERROR", f"{label} za ${listing['price_usd']:.2f}: {message[:200]}", info)


# ---------------------------------------------------------------------------
# Selling (Predaj tab): the hot wallet's cards and their own market listings

WALLET = None  # set in main(); the API thread lists cards with it
MAX_SELL_ITEMS = 20
MAX_SELL_PRICE_USD = float(os.getenv("DOLZ_SNIPER_MAX_SELL_PRICE_USD", "100000"))
# Cards can only be moved to these wallets, so a leaked dashboard token cannot send them elsewhere.
TRANSFER_TO = [
    a.strip().lower() for a in os.getenv("DOLZ_SNIPER_TRANSFER_TO", "0xa4cd3de07dafa3f700c908043118b39547190143").split(",")
    if re.fullmatch(r"0x[0-9a-fA-F]{40}", a.strip())
]


def own_listings(address):
    """Current listing per token id for cards this wallet listed: price, expiration, active."""
    latest = int(rpc("eth_blockNumber", []), 16)
    current = {}
    for entry in fetch_listing_events(max(0, latest - SELL_LOOKBACK_DAYS * BLOCKS_PER_DAY), latest, seller=address):
        token_id = int(entry["topics"][3], 16)
        if entry["topics"][0] == TOPIC_CANCELLED:
            current.pop(token_id, None)
        else:
            current[token_id] = decode_listing(entry)
    now = time.time()
    return {
        token_id: {
            "price_usd": listing["price_usd"] if listing["currency"] == USDC else None,
            "currency": "USDC" if listing["currency"] == USDC else listing["currency"],
            "expiration": listing["expiration"] or None,
            "active": listing["currency"] == USDC and (not listing["expiration"] or listing["expiration"] > now),
            "tx": listing["tx"],
        }
        for token_id, listing in current.items()
    }


def get_offer(token_id, offerer):
    """The stored offer of `offerer` on a card, or None when it no longer exists."""
    raw = eth_call(PAYMENT_SPENDER, "0x" + SEL_GET_OFFER + addr_word(DOLZ_NFT) + word(token_id) + addr_word(offerer))
    data = bytes.fromhex(raw[2:])
    if len(data) < 128:
        return None
    price = int.from_bytes(data[32:64], "big")
    if price == 0:
        return None
    currency = "0x" + data[76:96].hex()
    return {
        "offerer": offerer.lower(),
        "price_raw": str(price),
        "currency": "USDC" if currency == USDC else currency,
        "price_usd": price / 1e6 if currency == USDC else None,
        "expiration": int.from_bytes(data[96:128], "big") or None,
    }


def offer_fundable(token_id, offerer):
    try:
        data = "0x" + SEL_IS_OFFER_FUNDABLE + addr_word(DOLZ_NFT) + word(token_id) + addr_word(offerer)
        return int(eth_call(SALES_MANAGER, data), 16) == 1
    except Exception:
        return None


_fees = None


def seller_fee_bps():
    """Platform + collection fee taken from the seller, in basis points."""
    global _fees
    if _fees is None:
        try:
            platform = int(eth_call(PAYMENT_SPENDER, "0x" + SEL_PLATFORM_FEE_BPS + addr_word(DOLZ_NFT)), 16)
            collection = int(eth_call(PAYMENT_SPENDER, "0x" + SEL_COLLECTION_FEE_BPS + addr_word(DOLZ_NFT)), 16)
            _fees = platform + collection
        except Exception as exc:
            log(f"fee lookup failed: {exc!r}")
            return None
    return _fees


def get_logs_ranged(params, from_block, to_block):
    """eth_getLogs over a long range, split into smaller windows when a node refuses the full one."""
    try:
        return rpc("eth_getLogs", [{**params, "fromBlock": hex(from_block), "toBlock": hex(to_block)}])
    except Exception:
        if to_block - from_block < 10_000:
            raise
    logs = []
    step = 50_000 if to_block - from_block >= 50_000 else 9_500
    for start in range(from_block, to_block + 1, step):
        logs += get_logs_ranged(params, start, min(to_block, start + step - 1))
    return logs


def offer_events(token_ids, from_block, to_block):
    """OfferMade / OfferUpdated logs for the given cards (all DolzNFT cards when token_ids is None)."""
    base = {"address": OFFERS_MANAGER}
    if token_ids is None:
        params = {**base, "topics": [[TOPIC_OFFER_MADE, TOPIC_OFFER_UPDATED], None, "0x" + addr_word(DOLZ_NFT)]}
        return get_logs_ranged(params, from_block, to_block)
    ids = sorted(token_ids)
    logs = []
    for start in range(0, len(ids), 50):
        chunk = ["0x" + word(token_id) for token_id in ids[start:start + 50]]
        params = {**base, "topics": [[TOPIC_OFFER_MADE, TOPIC_OFFER_UPDATED], None, "0x" + addr_word(DOLZ_NFT), chunk]}
        logs += get_logs_ranged(params, from_block, to_block)
    return logs


def open_offers(token_ids):
    """Live offers per card: offerers from the event history, current terms from the marketplace."""
    if not token_ids:
        return {}
    latest = int(rpc("eth_blockNumber", []), 16)
    pairs = set()
    for entry in offer_events(token_ids, max(0, latest - OFFER_LOOKBACK_DAYS * BLOCKS_PER_DAY), latest):
        pairs.add((int(entry["topics"][3], 16), "0x" + entry["topics"][1][-40:]))

    def lookup(pair):
        token_id, offerer = pair
        try:
            offer = get_offer(token_id, offerer)
        except Exception:
            return token_id, None
        if offer:
            offer["fundable"] = offer_fundable(token_id, offerer)
        return token_id, offer

    now = time.time()
    offers = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for token_id, offer in pool.map(lookup, pairs):
            if offer and (not offer["expiration"] or offer["expiration"] > now):
                offers.setdefault(token_id, []).append(offer)
    for items in offers.values():
        items.sort(key=lambda offer: offer["price_usd"] or 0, reverse=True)
    return offers


def wallet_token_ids(address):
    """DolzNFT token ids the wallet may hold: sniper purchases, Blockscout, and recent incoming transfers."""
    ids = set()
    with db_cursor() as cur:
        cur.execute("SELECT DISTINCT token_id FROM dolz_sniper_purchases WHERE status = 'bought' AND dry_run = FALSE")
        ids.update(int(row[0]) for row in cur.fetchall())
    url = f"https://polygon.blockscout.com/api/v2/addresses/{address}/nft?type=ERC-721"
    try:
        for _ in range(20):
            page = fetch_json(url)
            for item in page.get("items") or []:
                token = item.get("token") or {}
                if (token.get("address_hash") or token.get("address") or "").lower() == DOLZ_NFT:
                    ids.add(int(item["id"]))
            params = page.get("next_page_params")
            if not params:
                break
            url = f"https://polygon.blockscout.com/api/v2/addresses/{address}/nft?type=ERC-721&" + urllib.parse.urlencode(params)
    except Exception as exc:
        log(f"blockscout wallet nfts failed: {exc!r}")
    # Blockscout misses some blocks: incoming transfers straight from the chain cover cards moved in.
    try:
        latest = int(rpc("eth_blockNumber", []), 16)
        logs = get_logs_ranged(
            {"address": DOLZ_NFT, "topics": [TOPIC_TRANSFER, None, "0x" + addr_word(address)]},
            max(0, latest - SELL_LOOKBACK_DAYS * BLOCKS_PER_DAY),
            latest,
        )
        ids.update(int(entry["topics"][3], 16) for entry in logs if len(entry["topics"]) == 4)
    except Exception as exc:
        log(f"incoming transfer scan failed: {exc!r}")
    return ids


def api_inventory():
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    address = wallet.address
    ids = wallet_token_ids(address)

    def owned(token_id):
        try:
            return owner_of(token_id).lower() == address
        except Exception:
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        held = [token_id for token_id, ok in zip(ids, pool.map(owned, ids)) if ok]
        cards = dict(zip(held, pool.map(card_metadata, held)))
    listings = own_listings(address)
    try:
        offers = open_offers(held)
    except Exception as exc:
        log(f"offer lookup failed: {exc!r}")
        offers = {}
    bought = {}
    with db_cursor() as cur:
        cur.execute(
            "SELECT token_id, price_usd, created_at FROM dolz_sniper_purchases "
            "WHERE status = 'bought' AND dry_run = FALSE ORDER BY created_at"
        )
        for token_id, price, created_at in cur.fetchall():
            bought[int(token_id)] = (float(price), created_at.isoformat())
    items = []
    for token_id in held:
        card = cards.get(token_id) or {}
        price, at = bought.get(token_id, (None, None))
        listing = listings.get(token_id)
        items.append({
            "token_id": str(token_id),
            "name": card.get("name"),
            "card": card.get("card"),
            "tier": card.get("tier"),
            "serial": card.get("serial"),
            "rarity": card.get("rarity"),
            "season": card.get("season"),
            "image": card.get("image"),
            "bought_usd": price,
            "bought_at": at,
            "listing": listing,
            "offers": offers.get(token_id, []),
        })
    items.sort(key=lambda item: (item["bought_at"] or "", item["token_id"]), reverse=True)
    return {
        "wallet": address,
        "durations": list(SELL_DURATIONS_DAYS),
        "transferTargets": TRANSFER_TO,
        "sellerFeeBps": seller_fee_bps(),
        "cards": items,
    }


def validate_sell_items(raw):
    items = raw.get("items") if isinstance(raw, dict) else None
    if not isinstance(items, list) or not items:
        raise ValueError("Vyber aspoň jednu kartu.")
    if len(items) > MAX_SELL_ITEMS:
        raise ValueError(f"Naraz najviac {MAX_SELL_ITEMS} kariet.")
    clean = []
    for item in items:
        try:
            token_id = int(str(item.get("token_id")))
            price = round(float(item.get("price_usd")), 2)
            days = int(item.get("days"))
        except (AttributeError, TypeError, ValueError):
            raise ValueError("Neplatná karta, cena alebo trvanie.")
        if not 0.01 <= price <= MAX_SELL_PRICE_USD:
            raise ValueError(f"Cena musí byť medzi $0.01 a ${MAX_SELL_PRICE_USD:g}.")
        if days not in SELL_DURATIONS_DAYS:
            raise ValueError("Trvanie musí byť " + ", ".join(f"{d} d" for d in SELL_DURATIONS_DAYS) + ".")
        clean.append({"token_id": token_id, "price_usd": price, "days": days})
    return clean


def card_label(token_id):
    card = card_metadata(token_id)
    return f"{card.get('name') or ('#' + str(token_id))} ({card.get('card') or '?'}, {card.get('rarity') or '?'} /{card.get('tier') or '?'} #{card.get('serial') or '?'})"


def is_revert(exc):
    message = str(exc).lower()
    return "revert" in message or "execution" in message


def api_list(raw):
    """List or reprice cards in USDC. Each card is one transaction, answered with its own result."""
    items = validate_sell_items(raw)
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    wallet.ensure_nft_approval()
    listings = own_listings(wallet.address)
    results = []
    for item in items:
        token_id = item["token_id"]
        result = {"token_id": str(token_id), "ok": False}
        try:
            if owner_of(token_id).lower() != wallet.address:
                raise RuntimeError("Karta už nie je v hot wallete.")
            price_raw = int(round(item["price_usd"] * 1e6))
            expiration = int(time.time()) + item["days"] * 86_400
            args = addr_word(DOLZ_NFT) + word(token_id) + word(price_raw) + addr_word(USDC) + word(expiration)
            current = listings.get(token_id)
            order = [SEL_UPDATE_LISTING, SEL_LIST_NFT] if current else [SEL_LIST_NFT, SEL_UPDATE_LISTING]
            try:
                tx_hash = wallet.send(LISTING_MANAGER, "0x" + order[0] + args)
                selector = order[0]
            except Exception as exc:
                # The contract may still keep an expired or stale listing (or none): try the other call.
                if not is_revert(exc):
                    raise
                tx_hash = wallet.send(LISTING_MANAGER, "0x" + order[1] + args)
                selector = order[1]
            ok = wallet.wait(tx_hash)
            action = "zmena ceny" if selector == SEL_UPDATE_LISTING else "vystavené"
            result.update({"ok": bool(ok), "tx": tx_hash, "action": action})
            if not ok:
                result["error"] = "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."
            label = card_label(token_id)
            info = {"token_id": token_id, "price_usd": item["price_usd"], "days": item["days"], "tx": tx_hash}
            if ok:
                record_event("DOLZ_SNIPER_LISTED", f"Na predaj ({action}): {label} za ${item['price_usd']:.2f} na {item['days']} d", info)
            else:
                record_event("DOLZ_SNIPER_LIST_FAILED", f"Vystavenie {label} neprešlo: {result['error']}", info)
        except Exception as exc:
            result["error"] = str(exc)[:300]
            record_event("DOLZ_SNIPER_LIST_FAILED", f"Vystavenie #{token_id} zlyhalo: {str(exc)[:200]}", {"token_id": token_id})
        results.append(result)
    listed = [r for r in results if r["ok"]]
    if listed:
        lines = [f"{card_label(int(r['token_id']))} za ${next(i['price_usd'] for i in items if str(i['token_id']) == r['token_id']):.2f}" for r in listed]
        notify("DOLZ_SNIPER_LISTED", "DOLZ: karty na predaj", "\n".join(lines), {"count": len(listed)})
    return results


def api_cancel(raw):
    token_ids = raw.get("token_ids") if isinstance(raw, dict) else None
    if not isinstance(token_ids, list) or not token_ids or len(token_ids) > MAX_SELL_ITEMS:
        raise ValueError("Vyber karty, ktorých ponuku chceš zrušiť.")
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    results = []
    for value in token_ids:
        result = {"token_id": str(value), "ok": False}
        try:
            token_id = int(str(value))
            tx_hash = wallet.send(LISTING_MANAGER, "0x" + SEL_CANCEL_LISTING + addr_word(DOLZ_NFT) + word(token_id))
            ok = wallet.wait(tx_hash)
            result.update({"ok": bool(ok), "tx": tx_hash})
            if ok:
                record_event("DOLZ_SNIPER_UNLISTED", f"Zrušená ponuka: {card_label(token_id)}", {"token_id": token_id, "tx": tx_hash})
            else:
                result["error"] = "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."
        except Exception as exc:
            result["error"] = str(exc)[:300]
        results.append(result)
    return results


def api_transfer(raw):
    """Move cards to one of the allowed wallets, cancelling their open listing first."""
    token_ids = raw.get("token_ids") if isinstance(raw, dict) else None
    to = str(raw.get("to") or "").strip().lower() if isinstance(raw, dict) else ""
    if not isinstance(token_ids, list) or not token_ids or len(token_ids) > MAX_SELL_ITEMS:
        raise ValueError(f"Vyber 1 až {MAX_SELL_ITEMS} kariet na presun.")
    if to not in TRANSFER_TO:
        raise ValueError("Na túto adresu sa karty presúvať nedajú.")
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    listings = own_listings(wallet.address)
    results = []
    moved = []
    for value in token_ids:
        result = {"token_id": str(value), "ok": False}
        try:
            token_id = int(str(value))
            if owner_of(token_id).lower() != wallet.address:
                raise RuntimeError("Karta už nie je v hot wallete.")
            # An open listing would come back to life if the card ever returned to this wallet.
            if listings.get(token_id, {}).get("active"):
                cancel_tx = wallet.send(LISTING_MANAGER, "0x" + SEL_CANCEL_LISTING + addr_word(DOLZ_NFT) + word(token_id))
                if not wallet.wait(cancel_tx):
                    raise RuntimeError(f"Zrušenie ponuky neprešlo: {cancel_tx}")
            data = "0x" + SEL_SAFE_TRANSFER_FROM + addr_word(wallet.address) + addr_word(to) + word(token_id)
            tx_hash = wallet.send(DOLZ_NFT, data)
            ok = wallet.wait(tx_hash)
            result.update({"ok": bool(ok), "tx": tx_hash, "action": "presunuté"})
            if ok:
                label = card_label(token_id)
                moved.append(label)
                record_event("DOLZ_SNIPER_MOVED", f"Presunuté na {to}: {label}", {"token_id": token_id, "to": to, "tx": tx_hash})
            else:
                result["error"] = "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."
        except Exception as exc:
            result["error"] = str(exc)[:300]
        results.append(result)
    if moved:
        notify("DOLZ_SNIPER_MOVED", "DOLZ: karty presunuté", f"Na {to}:\n" + "\n".join(moved), {"count": len(moved), "to": to})
    return results


def parse_offer_target(raw):
    if not isinstance(raw, dict):
        raise ValueError("Neplatná ponuka.")
    try:
        token_id = int(str(raw.get("token_id")))
    except ValueError:
        raise ValueError("Neplatná karta.")
    offerer = str(raw.get("offerer") or "").strip().lower()
    if not re.fullmatch(r"0x[0-9a-f]{40}", offerer):
        raise ValueError("Neplatná adresa ponúkajúceho.")
    return token_id, offerer


def api_offer(raw, action):
    """Accept (sell the card for the offer) or reject one offer on a hot-wallet card."""
    token_id, offerer = parse_offer_target(raw)
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    if owner_of(token_id).lower() != wallet.address:
        raise ValueError("Karta už nie je v hot wallete.")
    offer = get_offer(token_id, offerer)
    if not offer:
        raise ValueError("Ponuka už neexistuje.")
    label = card_label(token_id)
    info = {"token_id": token_id, "offerer": offerer, "price_usd": offer["price_usd"]}
    if action == "reject":
        tx_hash = wallet.send(OFFERS_MANAGER, "0x" + SEL_REJECT_OFFER + addr_word(DOLZ_NFT) + word(token_id) + addr_word(offerer))
        ok = wallet.wait(tx_hash)
        if ok:
            record_event("DOLZ_SNIPER_OFFER_REJECTED", f"Odmietnutá ponuka {offerer[:8]}… na {label}", {**info, "tx": tx_hash})
        return {"token_id": str(token_id), "ok": bool(ok), "tx": tx_hash, "action": "odmietnuté",
                **({} if ok else {"error": "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."})}
    # The exact price is part of the call: if the offerer changed it meanwhile, the contract refuses.
    expected = str(raw.get("price_raw") or "")
    if expected and expected != offer["price_raw"]:
        raise ValueError("Ponuka sa medzitým zmenila, obnov stránku.")
    if offer_fundable(token_id, offerer) is False:
        raise ValueError("Ponúkajúci nemá dosť USDC alebo povolenia, ponuku teraz nejde prijať.")
    wallet.ensure_nft_approval()
    data = "0x" + SEL_ACCEPT_OFFER + addr_word(DOLZ_NFT) + word(token_id) + addr_word(offerer) + word(int(offer["price_raw"]))
    tx_hash = wallet.send(SALES_MANAGER, data)
    ok = wallet.wait(tx_hash)
    if ok:
        price = f"${offer['price_usd']:.2f}" if offer["price_usd"] is not None else offer["price_raw"]
        record_event("DOLZ_SNIPER_OFFER_ACCEPTED", f"Prijatá ponuka {price} na {label}", {**info, "tx": tx_hash})
        notify("DOLZ_SNIPER_OFFER_ACCEPTED", "DOLZ: ponuka prijatá", f"{label} za {price}\nhttps://polygonscan.com/tx/{tx_hash}", {**info, "tx": tx_hash})
    return {"token_id": str(token_id), "ok": bool(ok), "tx": tx_hash, "action": "predané",
            **({} if ok else {"error": "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."})}


def check_offers(wallet, from_block, to_block):
    """Announce new or raised offers on cards the hot wallet holds."""
    for entry in offer_events(None, from_block, to_block):
        token_id = int(entry["topics"][3], 16)
        offerer = "0x" + entry["topics"][1][-40:]
        try:
            if owner_of(token_id).lower() != wallet.address:
                continue
            offer = get_offer(token_id, offerer)
        except Exception:
            continue
        if not offer:
            continue
        label = card_label(token_id)
        price = f"${offer['price_usd']:.2f}" if offer["price_usd"] is not None else f"{offer['price_raw']} ({offer['currency']})"
        kind = "Nová ponuka" if entry["topics"][0] == TOPIC_OFFER_MADE else "Zmenená ponuka"
        info = {"token_id": token_id, "offerer": offerer, "price_usd": offer["price_usd"], "tx": entry["transactionHash"]}
        record_event("DOLZ_SNIPER_OFFER", f"{kind} {price} na {label}", info)
        notify("DOLZ_SNIPER_OFFER", f"DOLZ: {kind.lower()}", f"{label}: {price}\nPrijať sa dá v tabe Predaj na matotam.io/dolz", info)


MANUAL_RULE = "ručný nákup"


def parse_token_id(raw):
    """A token id, or a dolz.io / polygonscan link ending in one."""
    text = str(raw or "").strip()
    match = re.search(r"(?:0x[0-9a-fA-F]{40}[/?a-zA-Z=]*)?(\d{1,9})/?(?:[?#].*)?$", text)
    if not match:
        raise ValueError("Zadaj odkaz na kartu z dolz.io alebo jej číslo (token ID).")
    contract = re.search(r"0x[0-9a-fA-F]{40}", text)
    if contract and contract.group(0).lower() != DOLZ_NFT:
        raise ValueError("Odkaz nie je na DOLZ kartu.")
    return int(match.group(1))


def market_listing(token_id):
    """The card's live market listing (price in USDC) or None."""
    raw = eth_call(PAYMENT_SPENDER, "0x" + SEL_GET_LISTING + addr_word(DOLZ_NFT) + word(token_id))
    data = bytes.fromhex(raw[2:])
    if len(data) < 192:
        return None
    seller = "0x" + data[12:32].hex()
    price = int.from_bytes(data[96:128], "big")
    if seller == "0x" + "00" * 20 or price == 0:
        return None
    currency = "0x" + data[140:160].hex()
    expiration = int.from_bytes(data[160:192], "big")
    return {
        "seller": seller,
        "price_raw": str(price),
        "currency": "USDC" if currency == USDC else currency,
        "price_usd": price / 1e6 if currency == USDC else None,
        "expiration": expiration or None,
        "active": (not expiration or expiration > time.time()) and owner_of(token_id).lower() == seller,
    }


def api_quote(raw):
    token_id = parse_token_id(raw.get("link") if isinstance(raw, dict) else None)
    card = card_metadata(token_id)
    listing = market_listing(token_id)
    return {"token_id": str(token_id), "card": card, "listing": listing, "maxPriceUsd": HARD_MAX_PRICE_USD}


def api_buy(raw):
    """Buy one listed card now, at exactly the price the dashboard showed."""
    if not isinstance(raw, dict):
        raise ValueError("Chýba karta.")
    token_id = parse_token_id(raw.get("link") or raw.get("token_id"))
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    listing = market_listing(token_id)
    if not listing or not listing["active"]:
        raise ValueError("Karta už nie je na predaj.")
    if listing["price_usd"] is None:
        raise ValueError("Karta nie je ponúkaná v USDC.")
    if str(raw.get("price_raw") or "") != listing["price_raw"]:
        raise ValueError("Cena sa medzitým zmenila, načítaj kartu znova.")
    if listing["price_usd"] > HARD_MAX_PRICE_USD:
        raise ValueError(f"Cena je nad bezpečnostným limitom ${HARD_MAX_PRICE_USD:g}.")
    if listing["seller"] == wallet.address:
        raise ValueError("Túto kartu predáva hot wallet sám.")
    price_raw = int(listing["price_raw"])
    if wallet.usdc_balance() < price_raw:
        raise ValueError("Na hot wallete nie je dosť USDC.")
    card = card_metadata(token_id)
    config, _ = load_config()
    record = {
        "token_id": token_id, "price_usd": listing["price_usd"], "seller": listing["seller"],
        "tx": f"manual-{token_id}-{int(time.time())}", "log_index": 0,
    }
    rule = {"name": MANUAL_RULE}
    wallet.ensure_allowance(price_raw, config["daily_budget_usd"])
    save_purchase(record, card, rule, "pending")
    try:
        tx_hash = wallet.send(SALES_MANAGER, "0x" + SEL_BUY_NFT + addr_word(DOLZ_NFT) + word(token_id) + word(price_raw))
    except Exception as exc:
        save_purchase(record, card, rule, "missed" if is_revert(exc) else "error", error=str(exc)[:500])
        raise
    save_purchase(record, card, rule, "pending", tx_hash=tx_hash)
    ok = wallet.wait(tx_hash)
    status = "bought" if ok else ("failed" if ok is False else "unconfirmed")
    save_purchase(record, card, rule, status, tx_hash=tx_hash)
    label = card_label(token_id)
    if ok:
        wallet.spent(price_raw)
        info = {"token_id": token_id, "price_usd": listing["price_usd"], "tx": tx_hash}
        record_event("DOLZ_SNIPER_BOUGHT", f"Ručne kúpené {label} za ${listing['price_usd']:.2f}", info)
        notify("DOLZ_SNIPER_BOUGHT", "DOLZ: ručný nákup", f"{label} za ${listing['price_usd']:.2f}\nhttps://polygonscan.com/tx/{tx_hash}", info)
    else:
        wallet.approved = 0
    return {"token_id": str(token_id), "ok": bool(ok), "tx": tx_hash, "action": "kúpené",
            **({} if ok else {"error": "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."})}


# ---------------------------------------------------------------------------
# Collection (Chýbajúce karty): which card numbers the owner's wallets hold, and the market floor per card

OWNER_WALLETS = [
    a.strip().lower() for a in os.getenv(
        "DOLZ_SNIPER_OWNER_WALLETS",
        "0xa4cd3de07dafa3f700c908043118b39547190143,0x49fcb83bed9983b9b9e4cf4e067c66e70d874a9d",
    ).split(",")
    if re.fullmatch(r"0x[0-9a-fA-F]{40}", a.strip())
]
COLLECTION_REFRESH_SECONDS = 600
COLLECTION_FROM_BLOCK = 70_000_000  # before the first DOLZ activity
COLLECTION_FLOOR_DAYS = 30
COLLECTION_REFRESH = threading.Event()
_collection = {"data": None, "refreshing": False}


def held_tokens(address):
    """DolzNFT token ids the address holds, from its full Transfer history on chain."""
    latest = int(rpc("eth_blockNumber", []), 16)
    incoming = get_logs_ranged({"address": DOLZ_NFT, "topics": [TOPIC_TRANSFER, None, "0x" + addr_word(address)]}, COLLECTION_FROM_BLOCK, latest)
    outgoing = get_logs_ranged({"address": DOLZ_NFT, "topics": [TOPIC_TRANSFER, "0x" + addr_word(address)]}, COLLECTION_FROM_BLOCK, latest)
    events = [(entry, 1) for entry in incoming] + [(entry, -1) for entry in outgoing]
    events.sort(key=lambda item: (int(item[0]["blockNumber"], 16), int(item[0]["logIndex"], 16)))
    held = set()
    for entry, delta in events:
        if len(entry["topics"]) != 4:
            continue
        token_id = int(entry["topics"][3], 16)
        if delta > 0:
            held.add(token_id)
        else:
            held.discard(token_id)
    return held


def market_floors(max_new_meta=400):
    """Cheapest live USDC listing per card number (seller still owns the card)."""
    latest = int(rpc("eth_blockNumber", []), 16)
    current = {}
    for entry in fetch_listing_events(max(0, latest - COLLECTION_FLOOR_DAYS * BLOCKS_PER_DAY), latest):
        token_id = int(entry["topics"][3], 16)
        if entry["topics"][0] == TOPIC_CANCELLED:
            current.pop(token_id, None)
        else:
            current[token_id] = decode_listing(entry)
    now = time.time()
    listings = sorted(
        (item for item in current.values() if item["currency"] == USDC and (not item["expiration"] or item["expiration"] > now)),
        key=lambda item: item["price_usd"],
    )
    by_card = {}
    fetched = 0
    for listing in listings:
        card = card_metadata(listing["token_id"], fetch=False)
        if card is None and fetched < max_new_meta:
            card = card_metadata(listing["token_id"])
            fetched += 1
        if card and card.get("card"):
            by_card.setdefault(card["card"].lower(), []).append((listing, card))

    def floor(items):
        for listing, card in items[:6]:  # cheapest first; sold cards still look listed, so check the owner
            try:
                if owner_of(listing["token_id"]).lower() == listing["seller"].lower():
                    return {
                        "token_id": str(listing["token_id"]),
                        "price_usd": listing["price_usd"],
                        "price_raw": str(listing["price_raw"]),
                        "rarity": card.get("rarity"),
                        "tier": card.get("tier"),
                        "serial": card.get("serial"),
                        "listings": len(items),
                    }
            except Exception:
                continue
        return None

    with ThreadPoolExecutor(max_workers=6) as pool:
        floors = dict(zip(by_card.keys(), pool.map(floor, by_card.values())))
    return {card: value for card, value in floors.items() if value}


def refresh_collection():
    wallets = list(dict.fromkeys(OWNER_WALLETS + ([WALLET.address] if WALLET else [])))
    holder = {}
    for address in wallets:
        for token_id in held_tokens(address):
            holder[token_id] = address
    with ThreadPoolExecutor(max_workers=6) as pool:
        cards = dict(zip(holder.keys(), pool.map(card_metadata, holder.keys())))
    owned = {}
    unknown = []
    for token_id, card in cards.items():
        number = (card or {}).get("card")
        if not number:
            unknown.append(str(token_id))
            continue
        entry = owned.setdefault(number.lower(), {"card": number.lower(), "name": card.get("name"), "season": card.get("season"), "count": 0, "wallets": {}})
        entry["count"] += 1
        entry["wallets"][holder[token_id]] = entry["wallets"].get(holder[token_id], 0) + 1
    with db_cursor() as cur:
        cur.execute(
            """SELECT card->>'card', MIN(card->>'name'), MIN(card->>'season') FROM dolz_sniper_cards
               WHERE card->>'card' IS NOT NULL GROUP BY card->>'card'"""
        )
        catalog = [{"card": c.lower(), "name": n, "season": se} for c, n, se in cur.fetchall()]
    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "wallets": wallets,
        "tokens": len(holder),
        "owned": sorted(owned.values(), key=lambda item: item["card"]),
        "unknownTokens": unknown,
        "catalog": catalog,
        "floors": market_floors(),
    }
    _collection["data"] = data
    set_state("collection", json.dumps(data, default=str))
    log(f"collection refreshed: {len(holder)} cards, {len(owned)} card numbers, {len(data['floors'])} floors")


def collection_loop():
    if WALLET is not None:
        WALLET.offer_reserve = offer_reserve_raw()
    try:
        saved = get_state("collection")
        if saved:
            _collection["data"] = json.loads(saved)
    except Exception as exc:
        log(f"collection state read failed: {exc!r}")
    while True:
        _collection["refreshing"] = True
        try:
            refresh_collection()
        except Exception as exc:
            log(f"collection refresh failed: {exc!r}")
        finally:
            _collection["refreshing"] = False
        COLLECTION_REFRESH.wait(COLLECTION_REFRESH_SECONDS)
        COLLECTION_REFRESH.clear()


def api_collection():
    return {"collection": _collection["data"], "refreshing": _collection["refreshing"]}


# ---------------------------------------------------------------------------
# Our own offers (Rýchly nákup → Ponuka): the hot wallet offers USDC on cards it does not hold

OFFER_RULE = "prijatá ponuka"


def my_offers():
    """Open offers the hot wallet made: offer events by it, current terms from the marketplace."""
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    latest = int(rpc("eth_blockNumber", []), 16)
    params = {"address": OFFERS_MANAGER, "topics": [[TOPIC_OFFER_MADE, TOPIC_OFFER_UPDATED], "0x" + addr_word(wallet.address), "0x" + addr_word(DOLZ_NFT)]}
    token_ids = {int(entry["topics"][3], 16) for entry in get_logs_ranged(params, max(0, latest - OFFER_LOOKBACK_DAYS * BLOCKS_PER_DAY), latest)}

    def lookup(token_id):
        try:
            offer = get_offer(token_id, wallet.address)
        except Exception:
            return None
        if not offer or (offer["expiration"] and offer["expiration"] < time.time()):
            return None
        card = card_metadata(token_id)
        try:
            listing = market_listing(token_id)
        except Exception:
            listing = None
        return {**offer, "token_id": str(token_id), "card": card, "listing": listing, "fundable": offer_fundable(token_id, wallet.address)}

    with ThreadPoolExecutor(max_workers=6) as pool:
        offers = [offer for offer in pool.map(lookup, token_ids) if offer]
    return sorted(offers, key=lambda offer: offer["expiration"] or 0)


def offer_reserve_raw():
    """USDC the hot wallet's open offers may pull, so the allowance keeps covering them."""
    try:
        return sum(int(offer["price_raw"]) for offer in my_offers() if offer["currency"] == "USDC")
    except Exception:
        return 0


def api_offer_make(raw):
    """Offer USDC for a card (or change our existing offer on it) for 1–180 days."""
    if not isinstance(raw, dict):
        raise ValueError("Chýba karta.")
    token_id = parse_token_id(raw.get("link") or raw.get("token_id"))
    try:
        price = round(float(raw.get("price_usd")), 2)
        days = int(raw.get("days") or 7)
    except (TypeError, ValueError):
        raise ValueError("Neplatná cena alebo trvanie.")
    if not 0.01 <= price <= HARD_MAX_PRICE_USD:
        raise ValueError(f"Ponuka musí byť medzi $0.01 a ${HARD_MAX_PRICE_USD:g}.")
    if days not in SELL_DURATIONS_DAYS:
        raise ValueError("Trvanie musí byť " + ", ".join(f"{d} d" for d in SELL_DURATIONS_DAYS) + ".")
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    if owner_of(token_id).lower() == wallet.address:
        raise ValueError("Túto kartu už hot wallet má.")
    price_raw = int(round(price * 1e6))
    if wallet.usdc_balance() < price_raw:
        raise ValueError("Na hot wallete nie je dosť USDC na túto ponuku.")
    existing = get_offer(token_id, wallet.address)
    # The marketplace pulls the USDC when the seller accepts, so the allowance must cover every open offer
    # plus the sniper's daily buying.
    reserve = max(0, offer_reserve_raw() - (int(existing["price_raw"]) if existing else 0))
    config, _ = load_config()
    wallet.offer_reserve = reserve + price_raw
    wallet.ensure_allowance(wallet.offer_reserve + int(config["daily_budget_usd"] * 1e6), config["daily_budget_usd"])
    expiration = int(time.time()) + days * 86_400
    if existing:
        data = "0x" + SEL_UPDATE_OFFER + addr_word(DOLZ_NFT) + word(token_id) + word(price_raw) + word(expiration)
    else:
        data = "0x" + SEL_MAKE_OFFER + addr_word(DOLZ_NFT) + word(token_id) + word(price_raw) + addr_word(USDC) + word(expiration)
    tx_hash = wallet.send(OFFERS_MANAGER, data)
    ok = wallet.wait(tx_hash)
    label = card_label(token_id)
    action = "ponuka zmenená" if existing else "ponuka odoslaná"
    if ok:
        info = {"token_id": token_id, "price_usd": price, "days": days, "tx": tx_hash}
        record_event("DOLZ_SNIPER_OFFER_MADE", f"{action.capitalize()}: ${price:.2f} na {label} ({days} d)", info)
    return {"token_id": str(token_id), "ok": bool(ok), "tx": tx_hash, "action": action,
            **({} if ok else {"error": "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."})}


def api_offer_cancel(raw):
    token_id = parse_token_id((raw or {}).get("token_id") if isinstance(raw, dict) else None)
    wallet = WALLET
    if wallet is None:
        raise RuntimeError("Sniper sa ešte spúšťa.")
    if not get_offer(token_id, wallet.address):
        raise ValueError("Na túto kartu nemáš otvorenú ponuku.")
    tx_hash = wallet.send(OFFERS_MANAGER, "0x" + SEL_CANCEL_OFFER + addr_word(DOLZ_NFT) + word(token_id))
    ok = wallet.wait(tx_hash)
    wallet.offer_reserve = offer_reserve_raw()
    if ok:
        record_event("DOLZ_SNIPER_OFFER_CANCELLED", f"Zrušená ponuka na {card_label(token_id)}", {"token_id": token_id, "tx": tx_hash})
    return {"token_id": str(token_id), "ok": bool(ok), "tx": tx_hash, "action": "ponuka zrušená",
            **({} if ok else {"error": "Transakcia neprešla." if ok is False else "Transakcia sa zatiaľ nepotvrdila."})}


def check_accepted_offers(wallet, from_block, to_block):
    """A seller accepted one of our offers: record it as a purchase and announce it."""
    logs = rpc("eth_getLogs", [{
        "address": SALES_MANAGER,
        "fromBlock": hex(from_block),
        "toBlock": hex(to_block),
        "topics": [TOPIC_OFFER_ACCEPTED, None, "0x" + addr_word(wallet.address)],
    }])
    for entry in logs:
        data = bytes.fromhex(entry["data"][2:])
        token_id = int.from_bytes(data[0:32], "big")
        price_raw = int.from_bytes(data[32:64], "big")
        currency = "0x" + data[76:96].hex()
        price_usd = price_raw / 1e6 if currency == USDC else 0
        seller = "0x" + entry["topics"][1][-40:]
        record = {"token_id": token_id, "price_usd": price_usd, "seller": seller,
                  "tx": entry["transactionHash"].lower(), "log_index": int(entry["logIndex"], 16)}
        card = card_metadata(token_id)
        save_purchase(record, card, {"name": OFFER_RULE}, "bought", tx_hash=entry["transactionHash"])
        wallet.spent(price_raw)
        wallet.offer_reserve = max(0, wallet.offer_reserve - price_raw)
        label = card_label(token_id)
        info = {"token_id": token_id, "price_usd": price_usd, "tx": entry["transactionHash"]}
        record_event("DOLZ_SNIPER_BOUGHT", f"Predajca prijal tvoju ponuku: {label} za ${price_usd:.2f}", info)
        notify("DOLZ_SNIPER_BOUGHT", "DOLZ: ponuka prijatá", f"{label} za ${price_usd:.2f}\nhttps://polygonscan.com/tx/{entry['transactionHash']}", info)


# ---------------------------------------------------------------------------
# Auction (Aukcia): keep the hot wallet's bid just inside the winning places of one rarity
#
# DOLZ auction contracts (e.g. 0x9e8c…bb69) sell `supply[r]` cards per rarity r (0 Legendary, 1 Epic,
# 2 Rare, 3 Limited) to the highest USDC bids placed before `end[r]`. bid(amount, rarity) places one bid
# per wallet and rarity; updateBid(bidId, newAmount, rarity) raises it. BidCreated / BidUpdated carry
# (bidder, amount, timestamp, bidId, rarity). Losing bids are refunded by DOLZ after the auction.

SEL_AUCTION_BID = "598647f8"          # bid(uint256 amount, uint256 rarity)
SEL_AUCTION_UPDATE_BID = "b3de7a9d"   # updateBid(uint256 bidId, uint256 newAmount, uint256 rarity)
SEL_AUCTION_SETTINGS = "30337c70"     # getSaleSettings()
SEL_AUCTION_TOKEN = "fc0c546a"        # token()
SEL_AUCTION_NFT = "be9a71bd"          # getNftAddress()
SEL_OWNER = "8da5cb5b"                # owner()
# DOLZ's deployer, which owns the marketplace and the auction contracts; only its auctions get USDC approval.
DOLZ_AUCTION_OWNERS = {a.strip().lower() for a in os.getenv("DOLZ_SNIPER_AUCTION_OWNERS", "0xd94298c2160ad8603216a3fa7a233ec609b2494d").split(",") if a.strip()}
TOPIC_BID_CREATED = "0x7a05ac1b6ef50434d957e30af7d77a87a18ece61017d7e5e5bb94e431a844e04"
TOPIC_BID_UPDATED = "0x9b7e56711beda201832eff9ed57917c56e56ed23e585fb7129e05e0111ee51b1"
AUCTION_RARITIES = ["Legendary", "Epic", "Rare", "Limited"]
AUCTION_LOOKBACK_BLOCKS = 600_000  # ~2 weeks; auctions run for days
_auction = {"book": {}, "last_block": None, "contract": None, "status": None, "acted": {}}
_auction_lock = threading.Lock()
_auction_settings_cache = {}


def auction_settings(contract):
    """supplies, starts, ends and minimum prices per rarity (getSaleSettings: four uint256[] arrays)."""
    cached = _auction_settings_cache.get(contract)
    if cached and time.time() - cached[0] < 60:
        return cached[1]
    raw = bytes.fromhex(eth_call(contract, "0x" + SEL_AUCTION_SETTINGS)[2:])
    words = [int.from_bytes(raw[i:i + 32], "big") for i in range(0, len(raw), 32)]

    # The struct is returned behind one offset word; its array offsets count from the struct start.
    def array(index):
        start = 1 + words[1 + index] // 32
        return words[start + 1:start + 1 + words[start]]

    settings = {"supply": array(0), "start": array(1), "end": array(2), "min_raw": array(3)}
    _auction_settings_cache[contract] = (time.time(), settings)
    return settings


def load_auction_configs():
    """One config per (auction, rarity); the first version stored a single config under "auction"."""
    try:
        raw = get_state("auctions")
        if raw:
            return json.loads(raw)
        legacy = get_state("auction")
        return [json.loads(legacy)] if legacy else []
    except Exception:
        return []


def refresh_auction_book(contract):
    """All bids of the auction (bidId -> latest amount), read incrementally from its events."""
    latest = int(rpc("eth_blockNumber", []), 16)
    with _auction_lock:
        if _auction["contract"] != contract:
            _auction.update(contract=contract, book={}, last_block=None, acted={})
        start = (_auction["last_block"] + 1) if _auction["last_block"] else max(0, latest - AUCTION_LOOKBACK_BLOCKS)
    if start > latest:
        return
    params = {"address": contract, "topics": [[TOPIC_BID_CREATED, TOPIC_BID_UPDATED]]}
    logs = get_logs_ranged(params, start, latest) if latest - start > 5_000 else rpc("eth_getLogs", [{**params, "fromBlock": hex(start), "toBlock": hex(latest)}])
    logs.sort(key=lambda entry: (int(entry["blockNumber"], 16), int(entry["logIndex"], 16)))
    with _auction_lock:
        for entry in logs:
            data = bytes.fromhex(entry["data"][2:])
            words = [int.from_bytes(data[i:i + 32], "big") for i in range(0, len(data), 32)]
            if len(words) < 5:
                continue
            bid = _auction["book"].setdefault(words[3], {"bidder": "0x" + data[12:32].hex(), "first": words[2]})
            bid.update(amount=words[1], ts=words[2], rarity=words[4], block=int(entry["blockNumber"], 16))
        _auction["last_block"] = latest


def auction_ranking(rarity):
    """Bids of one rarity, best first (higher amount, then the earlier bid)."""
    with _auction_lock:
        bids = [dict(bid, bid_id=bid_id) for bid_id, bid in _auction["book"].items() if bid.get("rarity") == rarity]
    return sorted(bids, key=lambda bid: (-bid["amount"], bid["ts"], bid["bid_id"]))


AUCTION_SPARE_PLACES = 1


def auction_target(config, settings, wallet):
    """What our bid should be now: just above the last winning place, never above the user's maximum."""
    rarity = config["rarity"]
    supply = settings["supply"][rarity]
    # Aim at the second-to-last winning place (one spare place), so a last-second bid does not push us out.
    place = max(1, supply - AUCTION_SPARE_PLACES)
    minimum = settings["min_raw"][rarity]
    ranking = auction_ranking(rarity)
    ours = next((bid for bid in ranking if bid["bidder"] == wallet.address), None)
    others = [bid for bid in ranking if bid["bidder"] != wallet.address]
    step = int(round(config.get("increment_usd", 1) * 1e6))
    if len(others) >= place and config.get("increment_pct"):
        # A percentage step grows with the price (others[place - 1] is the bid we must beat).
        step = max(step, int(others[place - 1]["amount"] * config["increment_pct"] / 100))
    # Past DOLZ auctions: the last winning place still rose 3-7 % in the final 15 s and up to ~1.5 % in the
    # final 5 s, while places 23-26 ended within ~2 % of each other. An extra margin near the end therefore
    # protects better than aiming at a higher place.
    if config.get("final_extra_usd") and settings["end"][rarity] - time.time() < config.get("final_window_s", 30):
        step += int(round(config["final_extra_usd"] * 1e6))
    if len(others) < place:
        target = minimum  # a place is free: the minimum price wins it
        cutoff = None
    else:
        cutoff = others[place - 1]["amount"]
        target = max(minimum, cutoff + step)
    position = next((index + 1 for index, bid in enumerate(ranking) if bid["bidder"] == wallet.address), None)
    return {
        "rarity": rarity,
        "supply": supply,
        "bids": len(ranking),
        "cutoff_raw": cutoff,
        "target_raw": target,
        "ours": ours,
        "position": position,
        "top": [{"amount_usd": bid["amount"] / 1e6, "bidder": bid["bidder"], "ts": bid["ts"]} for bid in ranking[: supply + 5]],
    }


def ensure_auction_allowance(wallet, contract, needed, amount):
    current = int(eth_call(USDC, "0x" + SEL_ALLOWANCE + addr_word(wallet.address) + addr_word(contract)), 16)
    if current >= needed:
        return
    tx_hash = wallet.send(USDC, "0x" + SEL_APPROVE + addr_word(contract) + word(amount))
    record_event("APPROVE", f"USDC approve {amount / 1e6:.2f} pre aukciu {contract[:10]}…", {"tx": tx_hash})
    if not wallet.wait(tx_hash, timeout=60):
        raise RuntimeError(f"USDC approve pre aukciu neprešiel: {tx_hash}")


def auction_step(config, wallet, configs, passive=False):
    contract = config["contract"]
    settings = auction_settings(contract)
    rarity = config["rarity"]
    now = time.time()
    end = settings["end"][rarity]
    refresh_auction_book(contract)
    state = auction_target(config, settings, wallet)
    max_raw = int(round(config["max_usd"] * 1e6))
    state.update(end=end, start=settings["start"][rarity], min_usd=settings["min_raw"][rarity] / 1e6, max_usd=config["max_usd"],
                 enabled=config.get("enabled", False), contract=contract, updated=now)
    ours = state["ours"]
    winning = ours is not None and state["position"] is not None and state["position"] <= state["supply"]
    state["winning"] = winning
    _auction.setdefault("statuses", {})[f"{contract}:{rarity}"] = state
    if passive or not config.get("enabled") or now < settings["start"][rarity] or now >= end:
        return end - now
    # Our bid is safe when it beats the last winning place of the others (a tie goes to the earlier bid).
    cutoff = state["cutoff_raw"]
    minimum = settings["min_raw"][rarity]
    if ours and ours["amount"] >= minimum and (cutoff is None or ours["amount"] > cutoff):
        return end - now
    target = state["target_raw"]
    if ours:
        # The contract rejects raising our own bid by less than 10 % of it.
        target = max(target, (ours["amount"] * 11 + 9) // 10)
        state["target_raw"] = target
    if target > max_raw:
        key = ("over", rarity, state["cutoff_raw"])
        if _auction["acted"].get(key) is None:
            _auction["acted"][key] = now
            msg = f"Aukcia {AUCTION_RARITIES[rarity]}: na miesto treba ${target / 1e6:.2f}, tvoj limit je ${config['max_usd']:.2f}. Neprihadzujem."
            record_event("DOLZ_SNIPER_AUCTION_LIMIT", msg, {"target": target / 1e6})
            notify("DOLZ_SNIPER_AUCTION_LIMIT", "DOLZ aukcia: nad limit", msg)
        return end - now
    # Last seconds: pay a higher priority fee so the bid lands in the next block.
    priority = 150 if end - now < 60 else None
    # One allowance covers every rarity we bid on in this auction.
    total_raw = sum(int(round(c["max_usd"] * 1e6)) for c in configs if c.get("enabled") and c.get("contract") == contract)
    # Only re-approve when the allowance cannot cover this bid; then approve twice the maxes so
    # later bids do not wait for another approve transaction.
    needed = target
    ensure_auction_allowance(wallet, contract, needed, 2 * max(total_raw, max_raw))
    if ours:
        data = "0x" + SEL_AUCTION_UPDATE_BID + word(ours["bid_id"]) + word(target) + word(rarity)
    else:
        data = "0x" + SEL_AUCTION_BID + word(target) + word(rarity)
    tx_hash = wallet.send(contract, data, priority_gwei=priority)
    ok = wallet.wait(tx_hash, timeout=20, poll=0.5)
    label = f"{AUCTION_RARITIES[rarity]} ${target / 1e6:.2f}"
    info = {"contract": contract, "rarity": rarity, "amount_usd": target / 1e6, "tx": tx_hash}
    if ok:
        cutoff_text = "voľné" if state["cutoff_raw"] is None else "$%.2f" % (state["cutoff_raw"] / 1e6)
        record_event("DOLZ_SNIPER_AUCTION_BID", f"Aukcia: prihodené {label} ({state['supply']} kariet, posledné víťazné miesto bolo {cutoff_text})", info)
        notify("DOLZ_SNIPER_AUCTION_BID", "DOLZ aukcia: prihodené", f"{label}\nhttps://polygonscan.com/tx/{tx_hash}", info)
        with _auction_lock:
            _auction["last_block"] = max(0, (_auction["last_block"] or 0) - 5)  # re-read the blocks around our bid
    else:
        record_event("DOLZ_SNIPER_AUCTION_FAILED", f"Aukcia: prihodenie {label} neprešlo ({'revert' if ok is False else 'nepotvrdené'})", info)
    return end - now


def auction_loop():
    """Only the rarity that ends next bids (the rarities end 20 minutes apart); the others just refresh
    their status every 30 s. Every 20 s normally, every second in the last 20 minutes."""
    passive_at = {}
    while True:
        configs = load_auction_configs()
        wait = 20
        now = time.time()
        current = None
        for config in configs:
            if config.get("enabled") and config.get("contract"):
                try:
                    end = auction_settings(config["contract"])["end"][config["rarity"]]
                except Exception:
                    continue
                if end > now and (current is None or end < current[0]):
                    current = (end, config["contract"], config["rarity"])
        for config in configs:
            if not config.get("contract") or WALLET is None:
                continue
            key = (config["contract"], config["rarity"])
            active = current is not None and key == current[1:]
            if not active:
                # No extra reads in the last 3 minutes of the active rarity.
                if (current and current[0] - now < 180) or now - passive_at.get(key, 0) < 30:
                    continue
                passive_at[key] = now
            try:
                remaining = auction_step(config, WALLET, configs, passive=not active)
                if not active:
                    continue
                if remaining is not None and config.get("enabled"):
                    wait = min(wait, 1 if 0 < remaining < 1200 else 20)
            except Exception as exc:
                log(f"auction step failed ({config.get('rarity')}): {exc!r}")
                wait = min(wait, 2)
        time.sleep(wait)


def api_auction_save(raw):
    if not isinstance(raw, dict):
        raise ValueError("Chýbajú nastavenia aukcie.")
    contract = str(raw.get("contract") or "").strip()
    match = re.search(r"0x[0-9a-fA-F]{40}", contract)
    if not match:
        raise ValueError("Zadaj odkaz na aukciu z dolz.io alebo adresu kontraktu.")
    contract = match.group(0).lower()
    try:
        rarity = int(raw.get("rarity"))
        max_usd = round(float(raw.get("max_usd")), 2)
        increment = round(float(raw.get("increment_usd", 1)), 2)
        final_extra = round(float(raw.get("final_extra_usd") or 0), 2)
        increment_pct = round(float(raw.get("increment_pct") or 0), 2)
    except (TypeError, ValueError):
        raise ValueError("Neplatná rarita, maximum alebo krok.")
    # The bot approves USDC to this contract, so it must be a genuine DOLZ auction: paid in USDC,
    # selling DolzNFT cards, owned by DOLZ.
    try:
        token = "0x" + eth_call(contract, "0x" + SEL_AUCTION_TOKEN)[-40:]
        nft = "0x" + eth_call(contract, "0x" + SEL_AUCTION_NFT)[-40:]
        owner = "0x" + eth_call(contract, "0x" + SEL_OWNER)[-40:]
    except Exception:
        raise ValueError("Toto nie je DOLZ aukcia (kontrakt neodpovedá ako aukcia).")
    if token.lower() != USDC or nft.lower() != DOLZ_NFT or owner.lower() not in DOLZ_AUCTION_OWNERS:
        raise ValueError("Toto nie je DOLZ aukcia (iná mena, iné NFT alebo iný vlastník kontraktu).")
    settings = auction_settings(contract)
    if not 0 <= rarity < len(settings["supply"]):
        raise ValueError("Táto aukcia takú raritu nemá.")
    if not 0 < max_usd <= HARD_MAX_PRICE_USD:
        raise ValueError(f"Maximum musí byť medzi $0.01 a ${HARD_MAX_PRICE_USD:g}.")
    if not 0.01 <= increment <= 50:
        raise ValueError("Krok musí byť medzi $0.01 a $50.")
    if not 0 <= final_extra <= 50:
        raise ValueError("Rezerva na záver musí byť medzi $0 a $50.")
    if not 0 <= increment_pct <= 50:
        raise ValueError("Krok v percentách musí byť medzi 0 a 50 %.")
    config = {"contract": contract, "rarity": rarity, "max_usd": max_usd, "increment_usd": increment, "increment_pct": increment_pct,
              "final_extra_usd": final_extra, "final_window_s": 30, "enabled": raw.get("enabled") is True}
    configs = [c for c in load_auction_configs() if not (c.get("contract") == contract and c.get("rarity") == rarity)]
    set_state("auctions", json.dumps(configs + [config]))
    record_event("DOLZ_SNIPER_AUCTION_CONFIG", f"Aukcia {AUCTION_RARITIES[rarity] if rarity < 4 else rarity}: max ${max_usd:.2f}, krok ${increment:.2f}, {'zapnutá' if config['enabled'] else 'vypnutá'}", config)
    return config



# ---------------------------------------------------------------------------
# Auction prizes: withdraw the won cards (and any refund) to the hot wallet.
# dolz.io publishes each claim (token ids, refund, claimer) through its public API and keeps a Merkle
# root of all claims on the auction contract. We rebuild the tree from the public claims, pick the leaf
# encoding whose root matches the chain, and simulate withdraw() before sending it.

DOLZ_BACKEND = "https://back.dolz.io/api.php"
SEL_AUCTION_WITHDRAW = "b5c1d22d"   # withdraw((uint256[],uint256,address),bytes32,bytes32[])
SEL_AUCTION_HASH_ROOT = "244cb2c8"  # getHashRoot()
SEL_AUCTION_TOKEN_CLAIMED = "d0582a4b"  # getTokenIsClaimed(uint256[])
AUCTION_CLAIM_EVERY = 120
_auction_claims = {}


def dolz_backend(body):
    request = urllib.request.Request(DOLZ_BACKEND, data=json.dumps(body).encode(), headers={
        "content-type": "application/json", "user-agent": "Mozilla/5.0 dolz-sniper", "origin": "https://dolz.io", "referer": "https://dolz.io/"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def auction_claim_entry(contract, address):
    rows = dolz_backend({"command": "getUserWithdraw", "contractAddress": contract, "userAddress": address}) or []
    for row in rows:
        if str(row.get("dawClaimer", "")).lower() == address.lower():
            return {"token_ids": [int(x) for x in json.loads(row.get("dawTokenIDs") or "[]")],
                    "refund": int(row.get("dawRefundAmount") or 0), "claimer": to_checksum_address(row["dawClaimer"])}
    return None


def _merkle_layers(leaves):
    layers = [leaves]
    while len(layers[-1]) > 1:
        layer, nxt = layers[-1], []
        for i in range(0, len(layer), 2):
            if i + 1 < len(layer):
                a, b = sorted((layer[i], layer[i + 1]))
                nxt.append(keccak(a + b))
            else:
                nxt.append(layer[i])
        layers.append(nxt)
    return layers


def _merkle_proof(layers, index):
    proof = []
    for layer in layers[:-1]:
        sibling = index ^ 1
        if sibling < len(layer):
            proof.append(layer[sibling])
        index //= 2
    return proof


def _claim_leaf_encoders():
    from eth_abi import encode
    tup = "(uint256[],uint256,address)"
    return {
        "encode(tuple)": lambda e: keccak(encode([tup], [(e["token_ids"], e["refund"], e["claimer"])])),
        "encode(fields)": lambda e: keccak(encode(["uint256[]", "uint256", "address"], [e["token_ids"], e["refund"], e["claimer"]])),
        "double encode(tuple)": lambda e: keccak(keccak(encode([tup], [(e["token_ids"], e["refund"], e["claimer"])]))),
        "double encode(fields)": lambda e: keccak(keccak(encode(["uint256[]", "uint256", "address"], [e["token_ids"], e["refund"], e["claimer"]]))),
        "packed": lambda e: keccak(b"".join(t.to_bytes(32, "big") for t in e["token_ids"]) + e["refund"].to_bytes(32, "big") + bytes.fromhex(e["claimer"][2:])),
        "packed address first": lambda e: keccak(bytes.fromhex(e["claimer"][2:]) + b"".join(t.to_bytes(32, "big") for t in e["token_ids"]) + e["refund"].to_bytes(32, "big")),
    }


def auction_withdraw_calls(contract, ours):
    """Candidate withdraw() calldata, best first: from a rebuilt tree whose root matches the chain."""
    from eth_abi import encode
    bids = dolz_backend({"command": "getContractBids", "contractAddress": contract}) or []
    bidders = sorted({str(b.get("bidder", "")).lower() for b in bids if b.get("bidder")})
    with ThreadPoolExecutor(max_workers=6) as pool:
        entries = [e for e in pool.map(lambda a: _safe(lambda: auction_claim_entry(contract, a)), bidders) if e]
    root = bytes.fromhex(eth_call(contract, "0x" + SEL_AUCTION_HASH_ROOT)[2:66])
    ours_key = (ours["claimer"].lower(), tuple(ours["token_ids"]), ours["refund"])
    orders = {
        "claimer": sorted(entries, key=lambda e: e["claimer"].lower()),
        "first token": sorted(entries, key=lambda e: (e["token_ids"][0] if e["token_ids"] else 1 << 60, e["claimer"].lower())),
        "bidders order": entries,
    }
    calls = []
    for enc_name, enc in _claim_leaf_encoders().items():
        for order_name, ordered in orders.items():
            leaves = [enc(e) for e in ordered]
            for sort_leaves in (False, True):
                lv = sorted(leaves) if sort_leaves else leaves
                layers = _merkle_layers(lv)
                if not layers or not layers[-1] or layers[-1][0] != root:
                    continue
                our_leaf = enc(ours)
                proof = _merkle_proof(layers, lv.index(our_leaf))
                for second in (our_leaf, root):
                    data = "0x" + SEL_AUCTION_WITHDRAW + encode(
                        ["(uint256[],uint256,address)", "bytes32", "bytes32[]"],
                        [(ours["token_ids"], ours["refund"], ours["claimer"]), second, proof]).hex()
                    calls.append((f"{enc_name}/{order_name}/{'sorted' if sort_leaves else 'as is'}", data))
    return calls, len(entries), "0x" + root.hex()


def _safe(fn):
    try:
        return fn()
    except Exception:
        return None


def auction_claim(contract, wallet, manual=False):
    """Withdraw our prizes from one auction if dolz.io has published our claim. Returns a status dict."""
    status = {"contract": contract, "checked": time.time()}
    _auction_claims[contract] = status
    ours = auction_claim_entry(contract, wallet.address)
    if not ours:
        status.update(state="waiting", message="dolz.io ešte nezverejnilo výhry pre hot wallet.")
        return status
    status.update(token_ids=ours["token_ids"], refund_usd=ours["refund"] / 1e6)
    if ours["token_ids"]:
        claimed = eth_call(contract, "0x" + SEL_AUCTION_TOKEN_CLAIMED + word(32) + word(len(ours["token_ids"])) + "".join(word(t) for t in ours["token_ids"]))
        raw = bytes.fromhex(claimed[2:])
        flags = [int.from_bytes(raw[64 + 32 * i: 96 + 32 * i], "big") for i in range(len(ours["token_ids"]))] if len(raw) >= 64 else []
        if flags and all(flags):
            status.update(state="done", message="Výhry sú už vybraté.")
            return status
    calls, count, root = auction_withdraw_calls(contract, ours)
    status.update(claims_seen=count, root=root)
    for name, data in calls:
        try:
            rpc("eth_call", [{"from": wallet.address, "to": contract, "data": data}, "latest"])
        except Exception as exc:
            status["last_error"] = str(exc)[:200]
            continue
        tx_hash = wallet.send(contract, data)
        ok = wallet.wait(tx_hash, timeout=90)
        info = {"contract": contract, "token_ids": ours["token_ids"], "refund_usd": ours["refund"] / 1e6, "tx": tx_hash, "method": name}
        if ok:
            msg = f"Aukcia: vybraté karty {ours['token_ids']}" + (f" a vrátených ${ours['refund'] / 1e6:.2f}" if ours["refund"] else "") + " do hot walletu"
            record_event("DOLZ_SNIPER_AUCTION_CLAIM", msg, info)
            notify("DOLZ_SNIPER_AUCTION_CLAIM", "DOLZ aukcia: výhry vybraté", f"{msg}\nhttps://polygonscan.com/tx/{tx_hash}", info)
            status.update(state="done", tx=tx_hash, message=msg)
        else:
            status.update(state="failed", tx=tx_hash, message="Transakcia výberu neprešla.")
        return status
    status.update(state="no_proof", message=f"Výhry sú zverejnené, ale dôkaz sa zatiaľ nepodarilo zostaviť ({count} nárokov, root {root[:10]}…). Skúsim znova.")
    if manual:
        log(f"auction claim: no valid proof yet ({count} claims, root {root})")
    return status


def auction_claim_loop():
    """Every 2 minutes, for auctions whose last rarity has ended, withdraw our prizes once dolz.io publishes them."""
    while True:
        time.sleep(AUCTION_CLAIM_EVERY)
        if WALLET is None:
            continue
        for contract in {c["contract"] for c in load_auction_configs() if c.get("contract")}:
            if (_auction_claims.get(contract) or {}).get("state") == "done":
                continue
            try:
                settings = auction_settings(contract)
                if time.time() < min(settings["end"]) + 600:
                    continue  # the first prizes become claimable ~10 minutes after the first rarity ends
                auction_claim(contract, WALLET)
            except Exception as exc:
                log(f"auction claim failed: {exc!r}")


def api_auction_claim(raw):
    contract = str((raw or {}).get("contract") or "").strip().lower()
    if not contract:
        configs = load_auction_configs()
        contract = configs[-1]["contract"] if configs else ""
    if not re.fullmatch(r"0x[0-9a-f]{40}", contract) or contract not in {c["contract"] for c in load_auction_configs()}:
        raise ValueError("Neznáma aukcia.")
    if WALLET is None:
        raise ValueError("Hot wallet nie je nastavený.")
    return auction_claim(contract, WALLET, manual=True)

def api_auction_status():
    configs = load_auction_configs()
    statuses = list((_auction.get("statuses") or {}).values())
    settings = None
    if configs:
        try:
            settings = auction_settings(configs[-1]["contract"])
        except Exception:
            pass
    return {"configs": configs, "statuses": statuses, "settings": settings, "rarities": AUCTION_RARITIES, "now": time.time(),
            "claims": list(_auction_claims.values())}


def check_sales(wallet, from_block, to_block):
    """Notify when a card leaves the hot wallet (sold on the market or moved)."""
    logs = rpc("eth_getLogs", [{
        "address": DOLZ_NFT,
        "fromBlock": hex(from_block),
        "toBlock": hex(to_block),
        "topics": [TOPIC_TRANSFER, "0x" + addr_word(wallet.address)],
    }])
    for entry in logs:
        if len(entry["topics"]) != 4:
            continue
        if "0x" + entry["topics"][2][-40:] in TRANSFER_TO:
            continue  # moved to the owner's own wallet, reported by api_transfer
        token_id = int(entry["topics"][3], 16)
        label = card_label(token_id)
        tx = entry["transactionHash"]
        record_event("DOLZ_SNIPER_SOLD", f"Karta odišla z hot walletu (predaj): {label}", {"token_id": token_id, "tx": tx})
        notify("DOLZ_SNIPER_SOLD", "DOLZ: karta predaná", f"{label}\nhttps://polygonscan.com/tx/{tx}", {"token_id": token_id, "tx": tx})


# ---------------------------------------------------------------------------
# Dashboard API
#
# matotam.io/dolz reads the status and saves settings through this API, so the
# sniper keeps its own database. Requests carry the owner's dashboard token in
# X-Dolz-Token; only its SHA-256 is configured here.

# Actions that spend USDC, move or list cards, or change what the sniper may buy need this password
# (header X-Dolz-Password) besides the dashboard token. Set only in Railway; unset disables them.
ACTION_PASSWORD = os.getenv("DOLZ_SNIPER_ACTION_PASSWORD", "").strip()
PROTECTED_POSTS = {"/auction", "/auction/claim", "/config", "/list", "/cancel", "/transfer", "/offer/accept", "/offer/reject", "/buy", "/offer/make", "/offer/cancel"}
_password_lock = threading.Lock()
_password_failures = {"count": 0, "locked_until": 0.0}

API_TOKEN_SHA256 = os.getenv(
    "DOLZ_SNIPER_API_TOKEN_SHA256", "4743035dfd2a43e9bedb9fa13478798113e60e6ca4c86f20fe7367ef7b6abcf0"
).strip().lower()
RARITY_NAMES = {"limited": "Limited", "rare": "Rare", "epic": "Epic", "legendary": "Legendary"}


def validate_config(raw):
    """Check settings from the dashboard; raises ValueError with a readable message."""
    if not isinstance(raw, dict):
        raise ValueError("Chýbajú nastavenia.")

    def number(value):
        if value is None or value == "":
            return None
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return None
        return parsed if parsed == parsed and abs(parsed) != float("inf") else None

    budget = number(raw.get("daily_budget_usd"))
    max_buys = number(raw.get("max_buys_per_day"))
    if budget is None or not 0 <= budget <= 5000:
        raise ValueError("Denný rozpočet musí byť medzi 0 a 5000 USD.")
    if max_buys is None or not 0 <= max_buys <= 500 or max_buys != int(max_buys):
        raise ValueError("Počet nákupov za deň musí byť celé číslo 0–500.")
    rules_in = raw.get("rules") if isinstance(raw.get("rules"), list) else []
    if len(rules_in) > MAX_RULES:
        raise ValueError(f"Najviac {MAX_RULES} pravidiel.")

    rules = []
    for index, rule in enumerate(rules_in):
        rule = rule if isinstance(rule, dict) else {}
        label = f"Pravidlo {index + 1}"
        max_price = number(rule.get("max_price"))
        if max_price is None or not 0 < max_price <= 200:
            raise ValueError(f"{label}: cena musí byť od 0,01 do 200 USD.")
        card = str(rule.get("card") or "").strip().lower() or None
        if card and not re.fullmatch(r"g\d{3,5}", card):
            raise ValueError(f"{label}: číslo karty má tvar g0177.")
        rarity = str(rule.get("min_rarity") or "").strip().lower() or None
        if rarity and rarity not in RARITY_NAMES:
            raise ValueError(f"{label}: neznáma rarita.")
        max_serial = number(rule.get("max_serial"))
        if max_serial is not None and (max_serial < 1 or max_serial != int(max_serial)):
            raise ValueError(f"{label}: max. sériové číslo musí byť kladné celé číslo.")
        season = season_key(rule.get("season"))
        if season and not (season.isdigit() and 1 <= int(season) <= 99) and not re.fullmatch(r"[A-Za-z][A-Za-z -]{0,39}", season):
            raise ValueError(f"{label}: neznáma sezóna.")
        card_name = rule.get("card_name")
        rules.append({
            "enabled": rule.get("enabled") is not False,
            "card": card,
            "card_name": str(card_name)[:120] if card and card_name else None,
            "min_rarity": RARITY_NAMES[rarity] if rarity else None,
            "season": season,
            "max_price": round(max_price, 2),
            "max_serial": int(max_serial) if max_serial is not None else None,
        })

    return {
        "enabled": raw.get("enabled") is True,
        "dry_run": raw.get("dry_run") is True,
        "daily_budget_usd": budget,
        "max_buys_per_day": int(max_buys),
        "rules": rules,
    }


def api_status():
    """Everything the dashboard's Sniper tab shows. Uses its own connection (runs in the API thread)."""
    con = psycopg2.connect(DATABASE_URL)
    try:
        with con.cursor() as cur:
            cur.execute("SELECT config, updated_at FROM dolz_sniper_config WHERE id = 1")
            row = cur.fetchone()
            config = {**DEFAULT_CONFIG, **(row[0] if row else {})}
            config_updated = row[1].isoformat() if row else None
            cur.execute("SELECT key, value FROM dolz_sniper_state")
            state = dict(cur.fetchall())
            cur.execute(
                """SELECT id, created_at, token_id::text, price_usd::text, rule_name, card_name, card_number, tier, serial,
                          rarity, status, tx_hash, error, dry_run
                   FROM dolz_sniper_purchases ORDER BY id DESC LIMIT 60"""
            )
            columns = [c[0] for c in cur.description]
            purchases = [dict(zip(columns, r)) for r in cur.fetchall()]
            cur.execute("SELECT id, created_at, event_type, message FROM dolz_sniper_events ORDER BY id DESC LIMIT 40")
            events = [dict(zip(("id", "created_at", "event_type", "message"), r)) for r in cur.fetchall()]
            day_start = "date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"
            cur.execute(
                f"SELECT COALESCE(SUM(price_usd), 0), COUNT(*) FROM dolz_sniper_purchases "
                f"WHERE status = 'bought' AND dry_run = FALSE AND created_at >= {day_start}"
            )
            spent_today, bought_today = cur.fetchone()
            cur.execute("SELECT COALESCE(SUM(price_usd), 0), COUNT(*) FROM dolz_sniper_purchases WHERE status = 'bought' AND dry_run = FALSE")
            spent_total, bought_total = cur.fetchone()
            # Every card the sniper has seen on the market, so the dashboard can name cards newer than its catalog.
            cur.execute(
                """SELECT card->>'card', MIN(card->>'name'), MIN(card->>'season'), COUNT(*)
                   FROM dolz_sniper_cards WHERE card->>'card' IS NOT NULL GROUP BY card->>'card' ORDER BY card->>'card'"""
            )
            catalog = [{"card": c, "name": n, "season": se, "seen": int(k)} for c, n, se, k in cur.fetchall()]
    finally:
        con.close()
    try:
        balances = json.loads(state.get("balances") or "{}")
    except ValueError:
        balances = {}
    return {
        "wallet": state.get("wallet"),
        "heartbeat": state.get("heartbeat"),
        "balances": balances,
        "config": config,
        "configUpdatedAt": config_updated,
        "configSeenAt": state.get("config_seen") or None,
        "spentTodayUsd": float(spent_today),
        "boughtToday": int(bought_today),
        "spentTotalUsd": float(spent_total),
        "boughtTotal": int(bought_total),
        "purchases": purchases,
        "events": events,
        "catalog": catalog,
    }


def api_save_config(config):
    con = psycopg2.connect(DATABASE_URL)
    try:
        with con, con.cursor() as cur:
            cur.execute(
                "INSERT INTO dolz_sniper_config (id, config, updated_at) VALUES (1, %s, NOW()) "
                "ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW() RETURNING updated_at",
                (psycopg2.extras.Json(config),),
            )
            return cur.fetchone()[0].isoformat()
    finally:
        con.close()


class ApiHandler(BaseHTTPRequestHandler):
    def _password_ok(self):
        """Second factor for actions that move USDC or cards: the dashboard token alone is not enough.
        Fails closed while DOLZ_SNIPER_ACTION_PASSWORD is not set; repeated wrong passwords lock it."""
        if not ACTION_PASSWORD:
            return "Akcie sú vypnuté: v Railway nastav premennú DOLZ_SNIPER_ACTION_PASSWORD (heslo pre transakcie)."
        with _password_lock:
            if time.time() < _password_failures["locked_until"]:
                return "Príliš veľa nesprávnych hesiel, skús to znova o 15 minút."
        given = self.headers.get("X-Dolz-Password", "").strip()
        if not given:
            # No password at all is not a guess: don't count it towards the lock.
            return "Zadaj heslo pre transakcie (vpravo hore na stránke)."
        if hmac.compare_digest(hashlib.sha256(given.encode()).digest(), hashlib.sha256(ACTION_PASSWORD.encode()).digest()):
            with _password_lock:
                _password_failures["count"] = 0
            return None
        with _password_lock:
            _password_failures["count"] += 1
            if _password_failures["count"] >= 5:
                _password_failures.update(count=0, locked_until=time.time() + 900)
                record_event("DOLZ_SNIPER_PASSWORD_LOCK", "5 nesprávnych hesiel pre transakcie, akcie zamknuté na 15 minút")
                notify("DOLZ_SNIPER_PASSWORD_LOCK", "DOLZ: nesprávne heslo", "5 nesprávnych hesiel pre transakcie na dashboarde, akcie sú na 15 minút zamknuté.")
        return "Nesprávne heslo pre transakcie."

    def _authorized(self):
        token = self.headers.get("X-Dolz-Token", "")
        digest = hashlib.sha256(token.encode()).hexdigest()
        return bool(token) and hmac.compare_digest(digest, API_TOKEN_SHA256)

    def _send(self, status, payload):
        body = json.dumps(payload, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = min(int(self.headers.get("Content-Length") or 0), 64_000)
        return json.loads(self.rfile.read(length) or b"null")

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        if self.path not in ("/status", "/inventory", "/collection", "/offers/mine", "/auction"):
            return self._send(404, {"ok": False, "error": "Not found"})
        if not self._authorized():
            return self._send(401, {"ok": False, "error": "Unauthorized"})
        try:
            if self.path == "/inventory":
                return self._send(200, {"ok": True, "inventory": api_inventory()})
            if self.path == "/auction":
                return self._send(200, {"ok": True, **api_auction_status()})
            if self.path == "/offers/mine":
                return self._send(200, {"ok": True, "offers": my_offers()})
            if self.path == "/collection":
                return self._send(200, {"ok": True, **api_collection()})
            self._send(200, {"ok": True, "sniper": api_status()})
        except Exception as exc:
            self._send(500, {"ok": False, "error": f"Načítanie zlyhalo: {exc}"})

    def do_POST(self):
        if self.path not in ("/config", "/rescan", "/list", "/cancel", "/transfer", "/offer/accept", "/offer/reject", "/quote", "/buy", "/collection/refresh", "/offer/make", "/offer/cancel", "/auction", "/auction/claim"):
            return self._send(404, {"ok": False, "error": "Not found"})
        if not self._authorized():
            return self._send(401, {"ok": False, "error": "Unauthorized"})
        if self.path in PROTECTED_POSTS:
            problem = self._password_ok()
            if problem:
                return self._send(403, {"ok": False, "error": problem, "password": True})
        if self.path == "/rescan":
            RESCAN_REQUESTED.set()
            return self._send(200, {"ok": True})
        if self.path == "/collection/refresh":
            COLLECTION_REFRESH.set()
            return self._send(200, {"ok": True})
        if self.path in ("/quote", "/buy"):
            try:
                body = self._body()
                payload = {"quote": api_quote(body)} if self.path == "/quote" else {"results": [api_buy(body)]}
            except ValueError as exc:
                return self._send(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                return self._send(500, {"ok": False, "error": f"Nákup zlyhal: {exc}"})
            return self._send(200, {"ok": True, **payload})
        if self.path == "/auction/claim":
            try:
                return self._send(200, {"ok": True, "claim": api_auction_claim(self._body())})
            except ValueError as exc:
                return self._send(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                return self._send(500, {"ok": False, "error": f"Výber zlyhal: {exc}"})
        if self.path == "/auction":
            try:
                config = api_auction_save(self._body())
            except ValueError as exc:
                return self._send(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                return self._send(500, {"ok": False, "error": f"Aukciu sa nepodarilo uložiť: {exc}"})
            return self._send(200, {"ok": True, "config": config})
        if self.path in ("/offer/make", "/offer/cancel"):
            try:
                body = self._body()
                result = api_offer_make(body) if self.path == "/offer/make" else api_offer_cancel(body)
            except ValueError as exc:
                return self._send(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                return self._send(500, {"ok": False, "error": f"Ponuka zlyhala: {exc}"})
            return self._send(200, {"ok": True, "results": [result]})
        if self.path.startswith("/offer/"):
            try:
                result = api_offer(self._body(), "accept" if self.path == "/offer/accept" else "reject")
            except ValueError as exc:
                return self._send(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                return self._send(500, {"ok": False, "error": f"Ponuka zlyhala: {exc}"})
            return self._send(200, {"ok": True, "results": [result]})
        if self.path in ("/list", "/cancel", "/transfer"):
            try:
                body = self._body()
                handler = {"/list": api_list, "/cancel": api_cancel, "/transfer": api_transfer}[self.path]
                results = handler(body)
            except ValueError as exc:
                return self._send(400, {"ok": False, "error": str(exc)})
            except Exception as exc:
                return self._send(500, {"ok": False, "error": f"Predaj zlyhal: {exc}"})
            return self._send(200, {"ok": True, "results": results})
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 64_000)
            config = validate_config(json.loads(self.rfile.read(length) or b"null"))
        except ValueError as exc:
            return self._send(400, {"ok": False, "error": str(exc)})
        try:
            updated_at = api_save_config(config)
        except Exception as exc:
            return self._send(500, {"ok": False, "error": f"Uloženie zlyhalo: {exc}"})
        self._send(200, {"ok": True, "config": config, "updatedAt": updated_at})

    def log_message(self, format, *args):  # keep Railway logs quiet
        return


def start_api():
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), ApiHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log(f"dashboard API listening on :{port}")


def publish_status(wallet, config, config_updated):
    set_state("heartbeat", datetime.now(timezone.utc).isoformat())
    set_state("config_seen", config_updated or "")
    try:
        set_state("balances", json.dumps({"usdc": wallet.usdc_balance() / 1e6, "pol": wallet.pol_balance() / 1e18}))
    except Exception as exc:
        log(f"balance check failed: {exc!r}")


def main():
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required")
    if not PRIVATE_KEY:
        raise SystemExit("DOLZ_SNIPER_PRIVATE_KEY is required")

    global WALLET
    init_db()
    wallet = Wallet(PRIVATE_KEY)
    WALLET = wallet
    start_api()
    threading.Thread(target=collection_loop, daemon=True).start()
    threading.Thread(target=auction_loop, daemon=True).start()
    threading.Thread(target=auction_claim_loop, daemon=True).start()
    set_state("wallet", wallet.address)
    config, config_updated = load_config()
    record_event(
        "DOLZ_SNIPER_STARTED",
        f"Sniper beží pre {wallet.address}: {len(config['rules'])} pravidiel, rozpočet ${config['daily_budget_usd']:g}/deň, "
        f"{'DRY RUN' if config['dry_run'] else 'LIVE'}{'' if config['enabled'] else ', vypnutý'}",
        {"config": config, "wallet": wallet.address},
    )
    notify(
        "DOLZ_SNIPER_STARTED",
        "DOLZ sniper beží",
        f"Hot wallet {wallet.address}: {len(config['rules'])} pravidiel, rozpočet ${config['daily_budget_usd']:g}/deň, "
        f"{'DRY RUN' if config['dry_run'] else 'LIVE'}{'' if config['enabled'] else ', vypnutý'}",
    )

    latest = int(rpc("eth_blockNumber", []), 16)
    saved = get_state("last_block")
    last_block = max(int(saved), latest - BACKFILL_BLOCKS) if saved else latest - BACKFILL_BLOCKS
    next_status = 0.0
    pending_scan = "štart"

    while True:
        try:
            config, updated = load_config()
            if updated != config_updated:
                config_updated = updated
                record_event("DOLZ_SNIPER_CONFIG", f"Nové nastavenia: {len(config['rules'])} pravidiel, rozpočet ${config['daily_budget_usd']:g}/deň, "
                             f"{'DRY RUN' if config['dry_run'] else 'LIVE'}{'' if config['enabled'] else ', vypnutý'}", {"config": config})
                pending_scan = "nové nastavenia"
            if RESCAN_REQUESTED.is_set():
                RESCAN_REQUESTED.clear()
                pending_scan = "na požiadanie"
            if pending_scan:
                def heartbeat():
                    nonlocal next_status
                    if time.time() >= next_status:
                        publish_status(wallet, config, config_updated)
                        next_status = time.time() + 30

                scan_active_listings(config, wallet, pending_scan, heartbeat)
                pending_scan = None  # only after success, so a failed scan is retried
            if time.time() >= next_status:
                publish_status(wallet, config, config_updated)
                next_status = time.time() + 30
            latest = int(rpc("eth_blockNumber", []), 16)
            if not config["enabled"] or not config["rules"]:
                last_block = latest  # paused: don't replay listings from the pause later
                set_state("last_block", last_block)
            while last_block < latest:
                to_block = min(latest, last_block + MAX_LOG_SPAN)
                listings = fetch_listings(last_block + 1, to_block)
                # Cheapest first, so a tight budget goes to the best deals.
                for listing in sorted(listings, key=lambda item: item["price_usd"]):
                    handle_listing(listing, config, wallet)
                try:
                    check_sales(wallet, last_block + 1, to_block)
                except Exception as exc:
                    log(f"sale check failed: {exc!r}")
                try:
                    check_offers(wallet, last_block + 1, to_block)
                except Exception as exc:
                    log(f"offer check failed: {exc!r}")
                try:
                    check_accepted_offers(wallet, last_block + 1, to_block)
                except Exception as exc:
                    log(f"accepted offer check failed: {exc!r}")
                last_block = to_block
                set_state("last_block", last_block)
        except Exception as exc:
            record_event("DOLZ_SNIPER_ERROR", f"Chyba v slučke: {exc!r}", {"trace": traceback.format_exc()[-1500:]})
            time.sleep(10)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
