import { ImapFlow } from "imapflow";
import { extract } from "letterparser";
import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/prisma";

export type PollResult = { imported: number; skipped: number; scanned: number };

/**
 * Pull messages from an IMAP inbox (Gmail by default) and import them
 * into the NassMail database. Uses **unseen** ∪ **recent (10d)** so replies that Gmail
 * already marked as read (e.g. opened on phone) are not missed. Routes delivery in this order:
 *   1. Any `To:` / `Cc:` / `Delivered-To:` / `X-Original-To:` matches a NassMail user.
 *   2. `In-Reply-To:` or `References:` matches a stored outbound `messageId`.
 *   3. `Re:` subject matches a recent SENT to the same external address (fallback when
 *      Message-Ids did not line up, e.g. old Resend sends that stored only the API id).
 *   4. Otherwise skip.
 */
export async function pollMailbox(): Promise<PollResult> {
  const user = (process.env.GMAIL_USER || process.env.IMAP_USER || "").trim();
  /** Google shows app passwords as groups of 4; spaces must be removed or auth fails. */
  const pass = (process.env.GMAIL_APP_PASSWORD || process.env.IMAP_PASSWORD || "").replace(/\s+/g, "");
  const host = process.env.IMAP_HOST || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT || 993);
  if (!user || !pass) throw new Error("IMAP credentials missing");

  const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
  let imported = 0;
  let skipped = 0;
  let scanned = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const unseen = (await client.search({ seen: false })) as number[] | false;
      const recent = (await client.search({ since: since })) as number[] | false;
      const uidSet = new Set<number>([
        ...(Array.isArray(unseen) ? unseen : []),
        ...(Array.isArray(recent) ? recent : []),
      ]);
      /** Newest first; cap keeps Vercel / Gmail latency predictable. */
      const uids = [...uidSet].sort((a, b) => b - a).slice(0, 120);
      scanned = uids.length;
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
        const envelopeAddrs = [
          extractHeader(raw, "Delivered-To"),
          extractHeader(raw, "X-Original-To"),
          extractHeader(raw, "Envelope-To"),
        ]
          .map((a) => a?.toLowerCase() ?? "")
          .filter(Boolean);
        const routedTo = [...new Set([...toAddrs, ...ccAddrs, ...envelopeAddrs])];
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

        // Route 2b: subject threading for external replies (covers legacy sends / Message-ID mismatch)
        const looksLikeReply = /^re:\s*/i.test(subject) || !!inReplyTo;
        if (!recipient && looksLikeReply && fromAddr) {
          const needle = baseSubjectForThread(subject);
          if (needle.length >= 2) {
            const sentCandidates = await prisma.email.findMany({
              where: {
                folder: "SENT",
                senderId: { not: null },
                toAddress: { equals: fromAddr, mode: "insensitive" },
              },
              orderBy: { createdAt: "desc" },
              take: 30,
              select: { senderId: true, threadId: true, subject: true },
            });
            const hit = sentCandidates.find((e) => baseSubjectForThread(e.subject) === needle);
            if (hit?.senderId) {
              recipient = await prisma.user.findUnique({ where: { id: hit.senderId } });
              threadId = hit.threadId ?? undefined;
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

  return { imported, skipped, scanned };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Header name match is case-insensitive; unfolds RFC 5322 folded lines. */
function extractHeader(raw: string, name: string): string | null {
  const re = new RegExp(
    `^${escapeRe(name)}:\\s*([^\r\n]+(?:\r?\n[ \t][^\r\n]+)*)`,
    "im",
  );
  const m = raw.match(re);
  if (!m) return null;
  const line = m[1].replace(/\r?\n[ \t]+/g, " ").trim();
  const inner = line.match(/^<([^>]+)>$/);
  if (inner) return inner[1].trim();
  const open = line.match(/^<([^>]+)>/);
  if (open) return open[1].trim();
  const bare = line.match(/^(\S+@\S+)/);
  return bare ? bare[1].trim() : line.split(/\s+/)[0]?.trim() || null;
}

function normalizeMessageId(id: string | null): string | null {
  if (!id) return null;
  return id.replace(/^<|>$/g, "").trim() || null;
}

/** Strips Re:/Fwd: chains for loose reply ↔ sent subject matching. */
function baseSubjectForThread(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 8; i++) {
    const next = t.replace(/^\s*(re|fw|fwd|aw)\s*:\s*/i, "").trim();
    if (next === t) break;
    t = next;
  }
  return t.toLowerCase();
}

function extractReferences(raw: string): string[] {
  const m = raw.match(/^references:\s*([^\r\n]+(?:\r?\n[ \t][^\r\n]+)*)/im);
  if (!m) return [];
  const line = m[1].replace(/\r?\n[ \t]+/g, " ");
  const out: string[] = [];
  for (const x of line.matchAll(/<([^>]+)>/g)) out.push(x[1]);
  return out;
}
