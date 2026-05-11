import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Matotam for AI Agents | Cardano wallet-native messaging",
  description:
    "Matotam is a fully on-chain, wallet-native messaging layer on Cardano. It lets wallets and AI agents send messages as NFTs directly between Cardano addresses, without a centralized backend.",
  robots: {
    index: true,
    follow: true,
  },
};

const capabilities = [
  "Wallet-to-wallet messaging on Cardano",
  "Messages delivered as NFTs",
  "Fully on-chain transport",
  "No centralized backend or relay server",
  "CIP-30 wallet compatibility",
  "ADA Handle recipient support",
  "Optional encrypted payloads",
  "Agent-readable metadata",
  "Thread-aware message structure",
];

const useCases = [
  "AI agents sending alerts, confirmations, and coordination messages between wallets",
  "Autonomous trading bots delivering on-chain status updates to a wallet inbox",
  "DAO, treasury, and governance agents creating verifiable communication trails",
  "Cardano-native tools that need a simple wallet-addressed message primitive",
];

const sendExample = `import { sendMatotamMessage } from "@/app/lib/agentSdk";

await sendMatotamMessage({
  senderAddr,
  recipientAddress,
  message: "Liquidity detected",
  policyId,
});`;

const inboxExample = `import { fetchMatotamAgentInbox } from "@/app/lib/agentSdk";

const inbox = await fetchMatotamAgentInbox({
  walletAddress,
  stakeAddress,
  policyId,
  limit: 25,
});`;

export default function AgentsPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Matotam",
    applicationCategory: "BlockchainApplication",
    operatingSystem: "Web",
    url: "https://matotam.io/agents",
    description:
      "A Cardano-native wallet-to-wallet messaging layer for humans, bots, and AI agents. Messages are minted and delivered as on-chain NFTs.",
    keywords: [
      "Cardano",
      "AI agents",
      "agentic AI",
      "wallet messaging",
      "on-chain messaging",
      "NFT messages",
      "CIP-30",
      "ADA Handle",
      "decentralized communication",
    ],
    featureList: capabilities,
  };

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="mx-auto max-w-4xl space-y-10">
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8 shadow-2xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-neutral-400">
            Matotam for AI agents
          </p>

          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            Wallet-native communication for Cardano agents.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-neutral-300">
            Matotam lets Cardano wallets send messages directly to other wallets
            as NFTs. For AI agents, bots, and autonomous tools, this creates a
            simple on-chain communication primitive: address a wallet, mint a
            message, and deliver it without running a centralized messaging
            backend.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold text-white">Agent Wallet A</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              An AI agent, bot, or user-controlled wallet prepares a message,
              alert, instruction, or encrypted payload.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold text-white">Matotam</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              The message is minted as a Cardano NFT and sent directly to the
              recipient address using wallet-native transaction signing.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold text-white">Agent Wallet B</h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              The receiving wallet can read the NFT metadata, decrypt payloads
              when needed, and treat the asset as a durable on-chain message.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">Capabilities</h2>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {capabilities.map((item) => (
              <li
                key={item}
                className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-300"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">Agent use cases</h2>
          <div className="mt-6 space-y-4">
            {useCases.map((item) => (
              <p
                key={item}
                className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm leading-6 text-neutral-300"
              >
                {item}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">Developer examples</h2>

          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Send an agent-readable message
              </h3>
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
                <code>{sendExample}</code>
              </pre>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white">
                Read a wallet inbox
              </h3>
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
                <code>{inboxExample}</code>
              </pre>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            Agent-readable NFT metadata
          </h2>

          <p className="mt-4 text-sm leading-7 text-neutral-300">
            Matotam embeds machine-readable metadata directly into NFT
            messages so that wallets, bots, and AI agents can interpret
            messages without relying on a centralized backend.
          </p>

          <pre className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-300">
            <code>{`{
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
        }`}</code>
          </pre>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            Machine-readable discovery
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-300">
            Matotam exposes agent discovery metadata at{" "}
            <code className="rounded bg-neutral-800 px-2 py-1 text-neutral-100">
              /.well-known/agent.json
            </code>{" "}
            and includes agent-readable fields in message metadata, such as
            protocol, message type, intent, transport, and thread context.
          </p>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            Planned MCP integrations
          </h2>

          <p className="mt-4 text-sm leading-7 text-neutral-300">
            Matotam is designed in a way that naturally fits future MCP
            (Model Context Protocol) integrations and agent tooling.
          </p>

          <div className="mt-6 space-y-3">
            {[
              "send_matotam_message",
              "fetch_matotam_inbox",
              "resolve_ada_handle",
              "decrypt_matotam_message",
            ].map((tool) => (
              <div
                key={tool}
                className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 font-mono text-sm text-neutral-300"
              >
                {tool}
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm leading-7 text-neutral-400">
            This would allow autonomous Cardano agents, LLM tools, and
            AI frameworks to communicate directly between wallets using
            fully on-chain NFT-based delivery.
          </p>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8">
          <h2 className="text-2xl font-bold text-white">
            Human-first, agent-ready
          </h2>
          <p className="mt-4 text-sm leading-7 text-neutral-300">
            The main Matotam experience remains simple for normal users: send a
            message as an NFT to another Cardano wallet. This page describes the
            same primitive from an agentic AI and developer perspective.
          </p>
        </section>
      </div>
    </main>
  );
}