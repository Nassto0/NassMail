import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { extract } from "letterparser";
import DOMPurify from "isomorphic-dompurify";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Poll Gmail (or any IMAP inbox) for new messages and import them.
 * Call: GET /api/inbound/poll?token=$IMAP_POLL_SECRET
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

  const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });

  let imported = 0;
  let skipped = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unseen = (await client.search({ seen: false })) as number[] | false;
      const uids = unseen || [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true, uid: true });
        if (!msg || !msg.source) continue;
        const raw = msg.source.toString("utf8");
        const parsed = extract(raw);

        const fromAddr = parsed.from?.address?.toLowerCase();
        const fromName = parsed.from?.name || null;
        const toAddrs = (parsed.to || []).map((a) => a.address?.toLowerCase()).filter(Boolean) as string[];
        const subject = (parsed.subject || "").slice(0, 500);
        const text = parsed.text || "";
        const html = DOMPurify.sanitize(parsed.html || "", { USE_PROFILES: { html: true } });
        const messageId = extractMessageId(raw);

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

function extractMessageId(raw: string): string | null {
  const m = raw.match(/^message-id:\s*<([^>]+)>/im);
  return m ? m[1] : null;
}
