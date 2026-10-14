import type { Metadata } from "next";
import WalletsDashboard from "./WalletsDashboard";

export const metadata: Metadata = {
  title: "Wallets | matotam",
  robots: { index: false, follow: false },
};

type WalletsPageProps = { searchParams: Promise<{ token?: string }> };

export default async function WalletsPage({ searchParams }: WalletsPageProps) {
  const params = await searchParams;
  return <WalletsDashboard token={params?.token ?? ""} />;
}
