# Matotam

Matotam is an on-chain messaging and NFT minting application built on the **Cardano blockchain**. It allows users to mint short messages as NFTs, enriched with deterministic visual identity (bubble, ornaments, sigils) derived from sender/receiver addresses, and optionally encrypt message content.

This repository represents the **current working state on a test environment**, reflecting the full feature set implemented so far.

---

## Core Concept

Matotam turns a message into a unique NFT:

* The **message text** is stored on-chain as NFT metadata
* The **visual appearance** is deterministically generated
* The NFT is **sent directly to the recipient wallet**
* Optional **encryption** protects message content

Each message is therefore:

* Immutable
* Verifiable on-chain
* Visually unique
* Owned by the recipient

---

## Key Features

### 1. Message-as-NFT Minting

* Mint a single NFT representing a message
* Message text is encoded into metadata
* Automatic minimum-ADA handling for UTXOs
* NFTs are sent directly to the target address

### 2. Deterministic Visual System

Each Matotam NFT includes a generated SVG preview composed of:

* **Bubble** – main message container
* **Rarity code** – deterministic code derived from sender/receiver pair
* **Ornaments** – generated from a swirl/ornament engine
* **Sigil** – symbolic mark derived from a wallet address

All visual elements are:

* Deterministic (same inputs → same output)
* Generated fully on the client
* Stored as SVG data URIs

### 3. Sigil Engine

* Generates a unique sigil per wallet address or ADA handle
* Configurable frames, interiors, and color palettes
* Supports:

  * Sender-based sigils
  * Manual sigil selection mode (Sigil Lab)

### 4. Encryption (Optional)

* Messages can be encrypted before minting
* Passphrase-based symmetric encryption
* Encrypted payload stored on-chain
* Decryption possible only with the correct passphrase

### 5. Wallet & Address Handling

* Supports raw Cardano addresses
* Supports ADA Handles (e.g. `$example`)
* Address normalization and validation
* Visual differentiation for:

  * Dev addresses
  * Test addresses
  * Regular users

### 6. Burn & Quick-Burn Utilities

* Includes helpers for:

  * NFT burning
  * Quick-burn identifiers
* Safe handling of multi-asset UTXO constraints
* Capacity checks to avoid accidental ADA loss

### 7. Overview & Statistics

* Overview page showing:

  * Sent messages
  * Received messages
  * Dev/Test/Regular breakdowns
  * Percentages and totals

---

## Technology Stack

* **Next.js (App Router)**
* **TypeScript**
* **React**
* **Lucid Cardano** (transaction building)
* **Blockfrost API** (chain data)
* **SVG-based generative graphics**

---

## Project Structure (Simplified)

```
src/
 ├─ app/            # App router pages
 ├─ lib/            # Core engines (sigil, ornament, svg, rarity, crypto)
 ├─ components/     # UI components
 └─ styles/         # Styling
```

Important internal modules:

* `sigilEngine.ts`
* `swirlEngine.ts`
* `svgBubble.ts`
* `rarity.ts`
* `quickBurn.ts`
* `crypto.ts`

---

## Development Setup

```bash
npm install
npm run dev
```

The app runs locally on:

```
http://localhost:3000
```

Environment variables (example):

```
NEXT_PUBLIC_BLOCKFROST_API_KEY=
NEXT_PUBLIC_NETWORK=preprod
```

---

## Design Principles

* Determinism over randomness
* On-chain first
* Minimal trust assumptions
* Visual identity tied to cryptographic identity
* Modular engines (sigil, ornament, rarity)

---

## Current Status

* Fully functional on **Cardano test environment**
* All minting, rendering, and encryption features active
* UI and engines considered feature-complete for v1

Future extensions (not yet implemented):

* Public minting for third-party artists
* Batch minting
* Advanced access control
* Mainnet deployment

---

## Disclaimer

This project is experimental.
Use at your own risk, especially when interacting with real funds.

---

## License

MIT (or to be defined)
