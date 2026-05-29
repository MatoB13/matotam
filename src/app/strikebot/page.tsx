import type { Metadata } from "next";
import StrikebotDashboard from "./StrikebotDashboard";

export const metadata: Metadata = {
  title: "Strikebot Live | matotam",
  robots: {
    index: false,
    follow: false,
  },
  themeColor: "#45ef6c",
};

type StrikebotPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function StrikebotPage({ searchParams }: StrikebotPageProps) {
  const params = await searchParams;
  const token = params?.token ?? "";
  const manifestHref = token
    ? `/strikebot/manifest.webmanifest?token=${encodeURIComponent(token)}`
    : "/strikebot/manifest.webmanifest";

  return (
    <>
      <link rel="manifest" href={manifestHref} />
      <meta name="theme-color" content="#45ef6c" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <StrikebotDashboard token={token} />
    </>
  );
}
