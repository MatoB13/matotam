import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Matotam API Spec | Agent-readable Cardano messaging",
  description:
    "Protocol schemas and developer examples for Matotam wallet-native messaging on Cardano.",
};

const sendSchema = `{
  "senderAddr": "addr1...",
  "recipientAddress": "addr1...",
  "message": "Liquidity detected",
  "policyId": "xxxxxxxx"
}`;

const inboxSchema = `{
  "asset": "policyidassethex",
  "sender": "addr1...",
  "receiver": "addr1...",
  "message": "Liquidity detected",
  "timestamp": "2026-05-11T12:00:00.000Z",
  "threadId": "matotam-abc-xyz",
  "encrypted": false
}`;

const metadataSchema = `{
  "protocol": "matotam",
  "messageType": "wallet-message",
  "Thread": "matotam-abc-xyz",
  "createdAt": "2026-05-11T12:00:00.000Z",
  "agent": {
    "readable": "true",
    "protocol": "matotam",
    "protocolVersion": "1",
    "type": "agent-readable-message",
    "intent": "wallet-message",
    "transport": "cardano-onchain-nft",
    "network": "cardano",
    "delivery": "wallet-to-wallet",
    "storage": "fully-onchain",
    "encrypted": "false",
    "requiresBackend": "false"
  }
}`;

export default function ApiSpecPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-5xl space-y-10">
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-neutral-400">
            Matotam protocol
          </p>

          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            API & protocol specification
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-300">
            Matotam exposes a lightweight, agent-readable messaging layer
            built on Cardano NFTs. These examples describe the current SDK
            and metadata structure used by wallets, bots, and AI agents.
          </p>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            Send message schema
          </h2>

          <pre className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
            <code>{sendSchema}</code>
          </pre>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            Inbox response schema
          </h2>

          <pre className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
            <code>{inboxSchema}</code>
          </pre>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            NFT metadata schema
          </h2>

          <pre className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
            <code>{metadataSchema}</code>
          </pre>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            Design philosophy
          </h2>

          <p className="mt-4 text-sm leading-7 text-neutral-300">
            Matotam intentionally avoids centralized messaging relays and
            traditional backend APIs. The protocol is designed around
            wallet-native interaction, fully on-chain delivery, and
            machine-readable NFT metadata.
          </p>

          <p className="mt-4 text-sm leading-7 text-neutral-400">
            Future extensions may include MCP-compatible tools, agent
            integrations, and autonomous wallet workflows.
          </p>
        </section>
      </div>
    </main>
  );
}