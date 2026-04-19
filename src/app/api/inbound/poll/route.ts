import { NextResponse } from "next/server";
import { pollMailbox } from "@/lib/imap-poll";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Triggers `pollMailbox()` (same as POST `/api/inbound/refresh` in the mail UI).
 * - Vercel Cron: set `CRON_SECRET`; platform sends `Authorization: Bearer <CRON_SECRET>`.
 * - Manual: `GET /api/inbound/poll?token=$IMAP_POLL_SECRET` (token must match env, not an arbitrary string).
 * Hobby plan: Vercel allows at most **daily** crons — see `vercel.json`; use Refresh for immediate pulls.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const vercelCron = cronSecret && auth === `Bearer ${cronSecret}`;

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-inbound-token");
  const imapSecret = process.env.IMAP_POLL_SECRET;
  const legacyToken = imapSecret && token === imapSecret;

  if (!vercelCron && !legacyToken) {
    if (!cronSecret && !imapSecret) {
      return NextResponse.json({ error: "Polling disabled (set CRON_SECRET and/or IMAP_POLL_SECRET)" }, { status: 503 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await pollMailbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Poll failed";
    console.error("[imap poll]", e);
    if (msg.includes("IMAP credentials missing")) {
      return NextResponse.json(
        {
          error: msg,
          hint: "Set GMAIL_USER + GMAIL_APP_PASSWORD (or IMAP_USER + IMAP_PASSWORD) on this deployment.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
