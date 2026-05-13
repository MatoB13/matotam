import type { Metadata } from "next";
import StrikebotDashboard from "./StrikebotDashboard";

export const metadata: Metadata = {
  title: "Strikebot Dashboard | matotam",
  robots: {
    index: false,
    follow: false,
  },
};

type StrikebotPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function StrikebotPage({ searchParams }: StrikebotPageProps) {
  const params = await searchParams;
  const token = params?.token ?? "";

  return <StrikebotDashboard token={token} />;
}
