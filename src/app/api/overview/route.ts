// src/app/api/overview/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  syncOverviewFromDevAddress,
  queryOverviewRows,
} from "../../lib/overviewSync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // run delta sync
    await syncOverviewFromDevAddress();

    const { searchParams } = new URL(req.url);

    const sender = searchParams.get("sender") || undefined;
    const receiver = searchParams.get("receiver") || undefined;
    const q = searchParams.get("q") || undefined;
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "50");

    const result = queryOverviewRows({
      sender,
      receiver,
      q,
      from,
      to,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Overview API error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
