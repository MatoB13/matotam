# Matotam Metadata Schema — Version 2

This document defines the **current metadata structure** used by Matotam
after full redesign of fields, naming, message handling, SVG handling,
threading and burn logic.

Metadata follows **CIP-721**, label **721**.

Only the fields listed below are included in version 2.

---

# 1. High-level Overview

Each Matotam message NFT contains:

- A UTF-8 on-chain message (256 chars max)
- Safe ASCII version split into ≤64-character segments
- Dynamic SVG bubble preview
- Sender & receiver full addresses (segmented)
- ADA burn + recovery logic (1.5 ADA locked)
- Thread grouping (`matotam-xxxxx-yyyyy`)
- Sequence number inside thread (001, 002, …)
- QuickBurnId (base64url unit)
- Human-readable burn instructions
- ISO timestamp

---

# 2. Metadata Layout

Example structure:

```jsonc
{
  "721": {
    "<policyId>": {
      "<assetName>": {
        "quickBurnId": "base64url-string",

        "Burn info": [
          "Segment 1 of burn text",
          "Segment 2 of burn text"
        ],

        "Sender": [
          "addr1qx...",
          "more segments..."
        ],

        "Receiver": [
          "addr1qy...",
          "more segments..."
        ],

        "Message": [
          "ASCII safe text segment 1",
          "ASCII safe text segment 2"
        ],

        "Thread": "matotam-abcde-fghij",
        "Thread index": "003",

        "Locked ADA": "1.5",

        "Created at": "2025-11-19T21:43:12.123Z",

        "image": [
          "data:image/svg+xml,<huge-svg-uri-split-into-64char-chunks>"
        ],
        "mediaType": "image/svg+xml",

        "name": "matotam-abcde-fghij-003",
        "description": "On-chain message sent via matotam.io",
        "source": "https://matotam.io",
        "version": "matotam-metadata-v2"
      }
    }
  }
}
```

---

# 3. Field Definitions

## 3.1 quickBurnId
Base64-URL encoded `unit` (policyId + assetNameHex).  
Used to burn the NFT without needing full metadata parsing.

## 3.2 Burn info
Full burn instructions, split into ≤64-character ASCII lines.

Version 2 uses:
```
To unlock the ADA in this message NFT, burn it on matotam.io. Burn can be done only by the sender, the receiver, or matotam.
```

## 3.3 Sender / Receiver
Full bech32 Cardano addresses of sender and receiver, segmented into 64-char chunks.

## 3.4 Message
The **ASCII-safe** version of the message  
(non-ASCII removed, quotes normalized), split into ≤64-character chunks.

This is the primary reconstructable text in v2.

## 3.5 Thread
Thread identifier used to group conversations.  
Format:
```
matotam-<last5OfSender>-<last5OfReceiver>
```

## 3.6 Thread index
Sequential message number inside the thread (e.g., `"001"`, `"002"`).  
Derived from Blockfrost counting output order.

## 3.7 Locked ADA
Always `"1.5"` — ADA locked inside the NFT output.

## 3.8 Created at
ISO timestamp (`new Date().toISOString()`).

## 3.9 image
SVG bubble preview encoded into a Data URI, truncated to 4096 chars,
then split into 64-char segments.

## 3.10 name
`matotam-xxxxx-yyyyy-###`  
Matches asset name exactly.

## 3.11 version
Current version tag: `"matotam-metadata-v2"`.

---

# 4. Compatibility

- v2 fully supports reading older Matotam NFTs (v0/v1)
- Older NFTs cannot be burned by v2 unless their policy matches the new multisig standard
- All new Matotam minting uses v2 exclusively
- Explorers should prefer:
  - `Message[]` → full message
  - `Burn info[]` → burn instructions
  - `Thread` + `Thread index` → grouping

---

# 5. Notes for Wallets & Explorers

- The first field displayed should always be **quickBurnId**
- Message bubble SVG is optional to display but recommended
- ADA reclaimability should be clearly shown
- Threads allow Telegram/Signal-like grouping for UX

---

# 6. Contact

matotam.io  
info@matotam.io
