import type { Metadata } from "next";
import DolzDashboard from "./DolzDashboard";

export const metadata: Metadata = {
  title: "DOLZ portfolio | matotam",
  robots: {
    index: false,
    follow: false,
  },
};

type DolzPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function DolzPage({ searchParams }: DolzPageProps) {
  const params = await searchParams;
  const token = params?.token ?? "";

  return <DolzDashboard token={token} />;
}
