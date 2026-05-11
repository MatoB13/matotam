import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://matotam.io";

const agenticAiJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "matotam",
  url: siteUrl,
  applicationCategory: "BlockchainApplication",
  operatingSystem: "Web",
  description:
    "Send a short message as a Cardano NFT. Simple. No backend.",
  keywords: [
    "Cardano",
    "ADA",
    "NFT messaging",
    "wallet-to-wallet messaging",
    "on-chain messaging",
    "wallet-native communication",
    "Cardano agents",
    "AI agent communication",
    "agentic AI",
    "agent-to-agent messaging",
    "decentralized messaging",
    "CIP-30",
    "ADA Handle",
    "fully on-chain",
    "no backend",
  ],
  featureList: [
    "Send messages directly between Cardano wallets",
    "Mint each message as a Cardano NFT",
    "Fully on-chain delivery without a backend or centralized relay",
    "Supports CIP-30 compatible Cardano wallets",
    "Supports ADA Handle recipient resolution",
    "Can be used as a wallet-native communication primitive for Cardano bots and AI agents",
  ],
  potentialAction: [
    {
      "@type": "CommunicateAction",
      name: "Send a wallet-to-wallet message on Cardano",
      target: siteUrl,
    },
  ],
  audience: [
    {
      "@type": "Audience",
      audienceType: "Cardano users",
    },
    {
      "@type": "Audience",
      audienceType: "Cardano developers, bots and AI agents",
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "matotam",
  description: "Send a short message as a Cardano NFT. Simple. No backend.",
  applicationName: "matotam",
  authors: [{ name: "matotam" }],
  creator: "matotam",
  publisher: "matotam",
  category: "Cardano NFT messaging",
  keywords: [
    "matotam",
    "Cardano",
    "ADA",
    "NFT messaging",
    "wallet-to-wallet messaging",
    "on-chain messaging",
    "wallet-native communication",
    "Cardano agents",
    "AI agent communication",
    "agentic AI",
    "agent-to-agent messaging",
    "decentralized messaging",
    "CIP-30",
    "ADA Handle",
    "fully on-chain",
    "no backend",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "matotam",
    title: "matotam",
    description: "Send a short message as a Cardano NFT. Simple. No backend.",
  },
  twitter: {
    card: "summary",
    title: "matotam",
    description: "Send a short message as a Cardano NFT. Simple. No backend.",
  },
  other: {
    "ai-agent-purpose":
      "Wallet-native, fully on-chain communication primitive for Cardano bots and AI agents.",
    "agentic-ai-use-cases":
      "agent-to-agent messaging, wallet notifications, trade coordination, DAO coordination, encrypted payload delivery, on-chain inbox",
    "cardano-capabilities":
      "CIP-30 wallet connection, ADA Handle resolution, NFT-based message delivery, fully on-chain metadata, no backend relay",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(agenticAiJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
