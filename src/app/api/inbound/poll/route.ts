import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import DOMPurify from "isomorphic-dompurify";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Poll Gmail (or any IMAP inbox) for new messages and import them.
 * Completely free when paired with a Gmail app password.
 *
 * Call: GET /api/inbound/poll?token=$IMAP_POLL_SECRET
 * Schedule it from Vercel Cron, or a keep-alive service, every few minutes.
 */
export async function GET(req: Request) {
  const secret = process.env.IMAP_POLL_SECRET;
  if (!secret) return NextResponse.json({ error: "Polling disabled" }, { status: 503 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-inbound-token");
  if (token !== secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = process.env.GMAIL_USER || process.env.IMAP_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.IMAP_PASSWORD;
  const host = process.env.IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT || 993);
  if (!user || !pass) return NextResponse.json({ error: "IMAP credentials missing" }, { status: 500 });

  const client = new ImapFlow({
    host, port, secure: true,
    auth: { user, pass },
    logger: false,
  });

  let imported = 0;
  let skipped = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unseen = (await client.search({ seen: false })) as number[] | false;
      const uids = unseen || [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const toList = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];
        const toAddrs = toList.flatMap((a) => (a && "value" in a ? a.value : [])).map((v) => v.address?.toLowerCase()).filter(Boolean) as string[];
        const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase();
        const fromName = parsed.from?.value?.[0]?.name || null;
        const subject = (parsed.subject || "").slice(0, 500);
        const text = parsed.text || "";
        const html = DOMPurify.sanitize(parsed.html || "", { USE_PROFILES: { html: true } });
        const messageId = parsed.messageId || null;

        if (!fromAddr || toAddrs.length === 0) { skipped++; continue; }

        const recipient = await prisma.user.findFirst({ where: { email: { in: toAddrs } } });
        if (!recipient) { skipped++; continue; }

        if (messageId) {
          const exists = await prisma.email.findUnique({ where: { messageId } });
          if (exists) { skipped++; continue; }
        }

        await prisma.email.create({
          data: {
            subject, bodyText: text, bodyHtml: html,
            fromAddress: fromAddr, fromName,
            toAddress: recipient.email, toName: recipient.displayName ?? recipient.username,
            folder: "INBOX", recipientId: recipient.id, isExternal: true,
            messageId: messageId || undefined,
          },
        });
        imported++;

        try { await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }); } catch {}
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Poll failed";
    console.error("[imap poll]", e);
    try { await client.logout(); } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, imported, skipped });
}
