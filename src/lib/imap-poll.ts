import { ImapFlow } from "imapflow";
import { extract } from "letterparser";
import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/prisma";

export type PollResult = { imported: number; skipped: number };

/**
 * Pull unread messages from an IMAP inbox (Gmail by default) and import them
 * into the NassMail database. Routes delivery in this order:
 *   1. Any `To:` / `Cc:` address matches a NassMail user.email → direct inbox deliver.
 *   2. `In-Reply-To:` or `References:` matches one of our previously-sent
 *      messageIds → deliver to that thread's original sender (handles the
 *      case where Gmail rewrote the From so recipients replied to the Gmail
 *      address instead of the NassMail address).
 *   3. Otherwise skip.
 */
export async function pollMailbox(): Promise<PollResult> {
  const user = process.env.GMAIL_USER || process.env.IMAP_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.IMAP_PASSWORD;
  const host = process.env.IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT || 993);
  if (!user || !pass) throw new Error("IMAP credentials missing");

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
        const addr = (addrs: typeof parsed.to) =>
          (addrs || []).map((a) => a.address?.toLowerCase()).filter(Boolean) as string[];
        const toAddrs = addr(parsed.to);
        const ccAddrs = addr(parsed.cc);
        const routedTo = [...new Set([...toAddrs, ...ccAddrs])];
        const subject = (parsed.subject || "").slice(0, 500);
        const text = parsed.text || "";
        const html = sanitizeHtml(parsed.html || "");

        const messageId = normalizeMessageId(extractHeader(raw, "Message-ID"));
        const inReplyTo = normalizeMessageId(extractHeader(raw, "In-Reply-To"));
        const referenceIds = extractReferences(raw).map(normalizeMessageId).filter(Boolean) as string[];

        if (!fromAddr) { skipped++; continue; }

        if (messageId) {
          const exists = await prisma.email.findUnique({ where: { messageId } });
          if (exists) { skipped++; continue; }
        }

        // Route 1: To or Cc matches a NassMail user (e.g. direct forward or reply-all)
        let recipient = routedTo.length
          ? await prisma.user.findFirst({ where: { email: { in: routedTo } } })
          : null;
        let threadId: string | undefined;

        // Route 2: message is a reply to something we sent — thread it back
        if (!recipient) {
          const idsToCheck = [...new Set([inReplyTo, ...referenceIds].filter(Boolean))] as string[];
          if (idsToCheck.length) {
            const original = await prisma.email.findFirst({
              where: { messageId: { in: idsToCheck } },
              select: { senderId: true, threadId: true },
            });
            if (original?.senderId) {
              recipient = await prisma.user.findUnique({ where: { id: original.senderId } });
              threadId = original.threadId ?? undefined;
            }
          }
        }

        if (!recipient) { skipped++; continue; }

        await prisma.email.create({
          data: {
            subject, bodyText: text, bodyHtml: html,
            fromAddress: fromAddr, fromName,
            toAddress: recipient.email, toName: recipient.displayName ?? recipient.username,
            folder: "INBOX", recipientId: recipient.id, isExternal: true,
            messageId: messageId || undefined,
            threadId,
          },
        });
        imported++;

        try { await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }); } catch {}
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch {}
    throw e;
  }

  return { imported, skipped };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Header name match is case-insensitive; value may be `<id>` or bare `id` per RFC 5322. */
function extractHeader(raw: string, name: string): string | null {
  const re = new RegExp(
    `^${escapeRe(name)}:\\s*(?:<([^>\\s]+)>|([^\\s]+))`,
    "im",
  );
  const m = raw.match(re);
  return (m?.[1] || m?.[2] || null)?.trim() || null;
}

function normalizeMessageId(id: string | null): string | null {
  if (!id) return null;
  return id.replace(/^<|>$/g, "").trim() || null;
}

function extractReferences(raw: string): string[] {
  const m = raw.match(/^references:\s*([^\r\n]+(?:\r?\n[ \t][^\r\n]+)*)/im);
  if (!m) return [];
  const line = m[1].replace(/\r?\n[ \t]+/g, " ");
  const out: string[] = [];
  for (const x of line.matchAll(/<([^>]+)>/g)) out.push(x[1]);
  return out;
}
