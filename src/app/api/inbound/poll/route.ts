import { NextResponse } from "next/server";
import { pollMailbox } from "@/lib/imap-poll";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cron-gated poller. Call: GET /api/inbound/poll?token=$IMAP_POLL_SECRET */
export async function GET(req: Request) {
  const secret = process.env.IMAP_POLL_SECRET;
  if (!secret) return NextResponse.json({ error: "Polling disabled" }, { status: 503 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-inbound-token");
  if (token !== secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await pollMailbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Poll failed";
    console.error("[imap poll]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
