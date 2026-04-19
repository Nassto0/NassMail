import { ImapFlow } from "imapflow";
import { extract } from "letterparser";
import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/prisma";

export type PollResult = { imported: number; skipped: number; scanned: number };

/**
 * Pull messages from an IMAP inbox (Gmail by default) and import them
 * into the NassMail database. Uses **unseen** ∪ **recent (10d)** so replies that Gmail
 * already marked as read (e.g. opened on phone) are not missed. Routes delivery in this order:
 *   1. Any NassMail address in To/Cc/Bcc/Reply-To, forward headers, `Received: … for <…>`,
 *      or anywhere in the **header block** (Cloudflare / Gmail often rewrite To to the Gmail user).
 *   2. `In-Reply-To:` or `References:` matches a stored outbound `messageId`.
 *   3. `Re:` subject matches a recent SENT to the same external address (fallback when
 *      Message-Ids did not line up, e.g. old Resend sends that stored only the API id).
 *   4. Otherwise skip.
 *
 * **Operations (not bugs in this file):**
 * - **Gmail self-send:** If `GMAIL_USER` sends to `@nassmail.com`, Gmail often dedupes/hides the inbound
 *   copy. Test from a **different** mailbox (another Gmail, Yahoo, etc.).
 * - **Spam:** Only folders listed in `IMAP_MAILBOXES` are read (default `INBOX`). Forwarded mail can land in
 *   **Spam**; add `[Gmail]/Spam` (comma-separated) or use a Gmail filter “never spam” for `@nassmail.com`.
 * - **`X-Forwarded-To`** is already parsed with other envelope headers.
 *
 * **Env:** `IMAP_DEBUG=1` — verbose logs. `IMAP_MAILBOXES` — e.g. `INBOX,[Gmail]/Spam` (Gmail paths).
 */
function imapDebugEnabled() {
  const v = (process.env.IMAP_DEBUG || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function imapLog(...args: unknown[]) {
  if (imapDebugEnabled()) console.log("[imap-poll]", ...args);
}

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
    const mailboxes = (process.env.IMAP_MAILBOXES || "INBOX")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const uidCap = mailboxes.length > 1 ? 80 : 120;

    for (const mailboxPath of mailboxes) {
      const lock = await client.getMailboxLock(mailboxPath);
      try {
        const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const unseen = (await client.search({ seen: false }, { uid: true })) as number[] | false;
        const recent = (await client.search({ since: since }, { uid: true })) as number[] | false;
        const uidSet = new Set<number>([
          ...(Array.isArray(unseen) ? unseen : []),
          ...(Array.isArray(recent) ? recent : []),
        ]);
        /** Newest first; cap keeps Vercel / Gmail latency predictable. */
        const uids = [...uidSet].sort((a, b) => b - a).slice(0, uidCap);
        scanned += uids.length;
        imapLog("batch-start", {
          mailbox: mailboxPath,
          scanned: uids.length,
          unseen: Array.isArray(unseen) ? unseen.length : 0,
          recent: Array.isArray(recent) ? recent.length : 0,
          domain: (process.env.NASS_DOMAIN || "nassmail.com").toLowerCase(),
        });
        for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) {
          imapLog("SKIP fetch-empty", { uid });
          continue;
        }
        const raw = msg.source.toString("utf8");
        const parsed = extract(raw);

        let fromAddr = parsed.from?.address?.toLowerCase() ?? null;
        if (!fromAddr) fromAddr = extractFromMailbox(raw);
        const fromName = parsed.from?.name || null;
        const addr = (addrs: typeof parsed.to) =>
          (addrs || []).map((a) => a.address?.toLowerCase()).filter(Boolean) as string[];
        const toAddrs = addr(parsed.to);
        const ccAddrs = addr(parsed.cc);
        const bccAddrs = addr(parsed.bcc);
        const replyAddrs = addr(parsed.replyTo);
        const envelopeAddrs = [
          extractHeader(raw, "Delivered-To"),
          extractHeader(raw, "X-Original-To"),
          extractHeader(raw, "Envelope-To"),
          extractHeader(raw, "X-Forwarded-To"),
        ]
          .flatMap((h) => (h ? splitAddressList(h) : []))
          .map((a) => a.toLowerCase())
          .filter(Boolean);
        const domain = (process.env.NASS_DOMAIN || "nassmail.com").toLowerCase();
        const sniffed = sniffNassAddressesInHeaderBlock(raw, domain);
        const receivedFor = extractForAddressesFromReceived(raw);
        /** Prefer To/Cc/Bcc/Reply-To @domain, then forward headers / Received / header sniff (Gmail+Cloudflare often strip NassMail from To). */
        const explicitNass = [...toAddrs, ...ccAddrs, ...bccAddrs, ...replyAddrs]
          .map((e) => e.toLowerCase())
          .filter((e) => e.endsWith(`@${domain}`));
        const implicitNass = [
          ...new Set([
            ...envelopeAddrs.filter((e) => e.endsWith(`@${domain}`)),
            ...receivedFor.filter((e) => e.endsWith(`@${domain}`)),
            ...sniffed,
          ]),
        ];
        const subject = (parsed.subject || "").slice(0, 500);
        const text = parsed.text || "";
        const html = sanitizeHtml(parsed.html || "");

        const messageId = normalizeMessageId(extractHeader(raw, "Message-ID"));
        const inReplyTo = normalizeMessageId(extractHeader(raw, "In-Reply-To"));
        const referenceIds = extractReferences(raw).map(normalizeMessageId).filter(Boolean) as string[];

        if (!fromAddr) {
          imapLog("SKIP no-from", { uid, subject: subject.slice(0, 120) });
          skipped++;
          continue;
        }

        if (messageId) {
          const exists = await prisma.email.findUnique({ where: { messageId } });
          if (exists) {
            imapLog("SKIP duplicate-message-id", { uid, messageId });
            skipped++;
            continue;
          }
        }

        // Route 1: any NassMail recipient on this message (explicit headers first)
        let recipient = await resolveNassRecipientByPriority(explicitNass, implicitNass);
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

        if (!recipient) {
          const idsForLog = [...new Set([inReplyTo, ...referenceIds].filter(Boolean))];
          imapLog("SKIP no-recipient", {
            uid,
            subject: subject.slice(0, 120),
            from: fromAddr,
            explicitNass,
            implicitNass,
            inReplyTo,
            referenceSample: referenceIds.slice(0, 3),
            idsForLog,
            looksLikeReply,
          });
          skipped++;
          continue;
        }

        imapLog("IMPORT", { mailbox: mailboxPath, uid, recipient: recipient.email, subject: subject.slice(0, 120) });

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

function splitAddressList(line: string): string[] {
  const out: string[] = [];
  for (const part of line.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const angle = t.match(/<([^>]+)>/);
    if (angle) {
      out.push(angle[1].trim());
      continue;
    }
    const bare = t.match(/\b([\w.%+-]+@[\w.-]+\.[a-z]{2,})\b/i);
    if (bare) out.push(bare[1]);
  }
  return out;
}

function extractFromMailbox(raw: string): string | null {
  const mLine = raw.match(/^from:\s*([^\r\n]+(?:\r?\n[ \t][^\r\n]+)*)/im);
  if (!mLine) return null;
  const line = mLine[1].replace(/\r?\n[ \t]+/g, " ").trim();
  const angle = line.match(/<([^>]+)>/);
  if (angle) return angle[1].toLowerCase();
  const bare = line.match(/\b([\w.%+-]+@[\w.-]+\.[a-z]{2,})\b/i);
  return bare ? bare[1].toLowerCase() : null;
}

/** Any @nassmail.com in the RFC822 header block (forwarding often hides it from To:). */
function sniffNassAddressesInHeaderBlock(raw: string, domain: string): string[] {
  const d = domain.toLowerCase();
  const dom = d.replace(/\./g, "\\.");
  const re = new RegExp(`\\b([a-z0-9._%+-]+)@${dom}\\b`, "gi");
  const end = raw.search(/\r?\n\r?\n/);
  const head = end === -1 ? raw : raw.slice(0, end);
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    set.add(`${m[1].toLowerCase()}@${d}`);
  }
  return [...set];
}

/** `Received:` lines often contain `for <user@domain>;` (Cloudflare / forwarding). */
function extractForAddressesFromReceived(raw: string): string[] {
  const end = raw.search(/\r?\n\r?\n/);
  const head = end === -1 ? raw : raw.slice(0, end);
  const re = /\bfor\s+(?:<([^>]+)>|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}))/gi;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const addr = (m[1] || m[2]).toLowerCase().trim();
    if (addr.includes("@")) set.add(addr);
  }
  return [...set];
}

async function resolveNassRecipientByPriority(
  explicitNass: string[],
  implicitNass: string[],
) {
  for (const email of [...new Set(explicitNass)]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) return u;
  }
  for (const email of [...new Set(implicitNass)]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) return u;
  }
  return null;
}
