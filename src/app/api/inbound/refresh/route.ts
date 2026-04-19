import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { pollMailbox } from "@/lib/imap-poll";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Authenticated on-demand inbox pull. Any signed-in user can trigger it. */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await pollMailbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refresh failed";
    console.error("[imap refresh]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
