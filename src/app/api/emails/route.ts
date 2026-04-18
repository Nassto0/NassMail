import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isNassAddress, sendExternal } from "@/lib/mailer";
import { NASS_DOMAIN } from "@/lib/utils";

const FOLDERS = ["INBOX", "SENT", "DRAFTS", "TRASH", "SPAM", "ALL", "STARRED", "IMPORTANT", "SNOOZED", "SCHEDULED"] as const;

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const folderParam = (url.searchParams.get("folder") || "INBOX").toUpperCase();
  const folder = (FOLDERS as readonly string[]).includes(folderParam) ? folderParam : "INBOX";
  const q = url.searchParams.get("q")?.trim();
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  const subject = url.searchParams.get("subject")?.trim();
  const hasWords = url.searchParams.get("hasWords")?.trim();
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const labelId = url.searchParams.get("label");

  const now = new Date();
  const where: any = { AND: [] };

  switch (folder) {
    case "INBOX":
      where.AND.push(
        { folder: "INBOX", recipientId: user.id },
        { OR: [{ snoozeUntil: null }, { snoozeUntil: { lte: now } }] },
      );
      break;
    case "SENT":
      where.AND.push({ folder: "SENT", senderId: user.id }, { OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] });
      break;
    case "DRAFTS":
      where.AND.push({ folder: "DRAFTS", senderId: user.id });
      break;
    case "TRASH":
      where.AND.push({ folder: "TRASH", OR: [{ senderId: user.id }, { recipientId: user.id }] });
      break;
    case "SPAM":
      where.AND.push({ folder: "SPAM", recipientId: user.id });
      break;
    case "ALL":
      where.AND.push({ OR: [{ senderId: user.id }, { recipientId: user.id }] }, { folder: { notIn: ["TRASH"] } });
      break;
    case "STARRED":
      where.AND.push({ isStarred: true }, { OR: [{ senderId: user.id }, { recipientId: user.id }] });
      break;
    case "IMPORTANT":
      where.AND.push({ isImportant: true, recipientId: user.id });
      break;
    case "SNOOZED":
      where.AND.push({ recipientId: user.id }, { snoozeUntil: { gt: now } });
      break;
    case "SCHEDULED":
      where.AND.push({ senderId: user.id }, { scheduledFor: { gt: now } });
      break;
  }

  if (q) {
    where.AND.push({
      OR: [
        { subject: { contains: q } },
        { bodyText: { contains: q } },
        { fromAddress: { contains: q } },
        { toAddress: { contains: q } },
        { fromName: { contains: q } },
      ],
    });
  }
  if (from)     where.AND.push({ OR: [{ fromAddress: { contains: from } }, { fromName: { contains: from } }] });
  if (to)       where.AND.push({ OR: [{ toAddress: { contains: to } }, { toName: { contains: to } }] });
  if (subject)  where.AND.push({ subject: { contains: subject } });
  if (hasWords) where.AND.push({ OR: [{ bodyText: { contains: hasWords } }, { subject: { contains: hasWords } }] });
  if (dateFrom) where.AND.push({ createdAt: { gte: new Date(dateFrom) } });
  if (dateTo)   where.AND.push({ createdAt: { lte: new Date(dateTo) } });
  if (labelId)  where.AND.push({ emailLabels: { some: { labelId } } });

  if (where.AND.length === 0) delete where.AND;

  const emails = await prisma.email.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, subject: true, fromAddress: true, fromName: true, toAddress: true, toName: true,
      isRead: true, isStarred: true, isImportant: true, folder: true, createdAt: true,
      bodyText: true, snoozeUntil: true, scheduledFor: true,
      emailLabels: { select: { label: { select: { id: true, name: true, color: true } } } },
    },
  });

  return NextResponse.json({ emails });
}

const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().max(500).default(""),
  text: z.string().default(""),
  html: z.string().default(""),
  draft: z.boolean().optional(),
  scheduledFor: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { to, subject, text, draft, scheduledFor } = parsed.data;
  const cleanHtml = DOMPurify.sanitize(parsed.data.html || "", { USE_PROFILES: { html: true } });
  const from = user.email;
  const fromName = user.displayName ?? user.username;

  if (draft) {
    const email = await prisma.email.create({
      data: {
        subject, bodyText: text, bodyHtml: cleanHtml,
        fromAddress: from, fromName, toAddress: to,
        folder: "DRAFTS", senderId: user.id,
      },
    });
    return NextResponse.json({ ok: true, email });
  }

  if (scheduledFor) {
    const email = await prisma.email.create({
      data: {
        subject, bodyText: text, bodyHtml: cleanHtml,
        fromAddress: from, fromName, toAddress: to,
        folder: "SENT", senderId: user.id, isRead: true,
        scheduledFor: new Date(scheduledFor),
      },
    });
    return NextResponse.json({ ok: true, scheduled: true, email });
  }

  if (isNassAddress(to)) {
    const recipient = await prisma.user.findUnique({ where: { email: to.toLowerCase() } });
    if (recipient) {
      const threadId = randomUUID();
      const sent = await prisma.email.create({
        data: {
          subject, bodyText: text, bodyHtml: cleanHtml,
          fromAddress: from, fromName, toAddress: to,
          folder: "SENT", senderId: user.id, isRead: true,
          threadId,
        },
      });
      await prisma.email.create({
        data: {
          subject, bodyText: text, bodyHtml: cleanHtml,
          fromAddress: from, fromName, toAddress: to, toName: recipient.displayName ?? recipient.username,
          folder: "INBOX", senderId: user.id, recipientId: recipient.id,
          threadId,
        },
      });
      return NextResponse.json({ ok: true, delivery: "internal", email: sent });
    }
    const sent = await prisma.email.create({
      data: {
        subject, bodyText: text, bodyHtml: cleanHtml,
        fromAddress: from, fromName, toAddress: to,
        folder: "SENT", senderId: user.id, isRead: true,
      },
    });
    return NextResponse.json({ ok: false, error: `No NassMail user at ${to}`, email: sent }, { status: 404 });
  }

  const sent = await prisma.email.create({
    data: {
      subject, bodyText: text, bodyHtml: cleanHtml,
      fromAddress: from, fromName, toAddress: to,
      folder: "SENT", senderId: user.id, isRead: true,
    },
  });

  try {
    const result = await sendExternal({
      from, fromName, to, subject,
      text: text || stripHtml(cleanHtml),
      html: cleanHtml || `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    });
    return NextResponse.json({ ok: true, delivery: "external", provider: result.provider, email: sent });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Send failed",
        hint: `Configure MAIL_PROVIDER in .env. Current domain: ${NASS_DOMAIN}`, email: sent },
      { status: 502 },
    );
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function stripHtml(s: string) { return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }
