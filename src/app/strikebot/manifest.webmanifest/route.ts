import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const startUrl = token ? `/strikebot?token=${encodeURIComponent(token)}` : "/strikebot";

  return NextResponse.json(
    {
      name: "Strikebot Live",
      short_name: "Strikebot",
      description: "Private mobile monitor for the Strikebot live executor.",
      start_url: startUrl,
      scope: "/strikebot",
      display: "standalone",
      background_color: "#071018",
      theme_color: "#45ef6c",
      orientation: "portrait",
      icons: [
        { src: "/matotam-logo.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/matotam-logo.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } },
  );
}
