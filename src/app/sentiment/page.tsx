import type { Metadata } from "next";
import SentimentDashboard from "./SentimentDashboard";

export const metadata: Metadata = {
  title: "Market Sentiment | matotam",
  robots: {
    index: false,
    follow: false,
  },
  themeColor: "#45ef6c",
};

type SentimentPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function SentimentPage({ searchParams }: SentimentPageProps) {
  const params = await searchParams;
  const token = params?.token ?? "";

  return <SentimentDashboard token={token} />;
}
