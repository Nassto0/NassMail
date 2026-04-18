import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { prisma } from "@/lib/prisma";

/**
 * Inbound webhook — receives mail forwarded from an inbound service
 * (Mailgun Routes, CloudMailin, Resend Inbound, etc.).
 *
 * Expected JSON (we accept the common shapes and normalize):
 *   { from, fromName?, to, subject?, text?, html?, messageId? }
 *
 * Auth: ?token=... query OR X-Inbound-Token header must match
 *       INBOUND_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook disabled" }, { status: 503 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-inbound-token");
  if (token !== secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let payload: any;
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    payload = await req.json().catch(() => null);
  } else {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    payload = Object.fromEntries(form.entries());
  }
  if (!payload) return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  const from = String(payload.from || payload.sender || payload["From"] || "").trim();
  const to = String(payload.to || payload.recipient || payload["To"] || "").trim();
  const subject = String(payload.subject || payload["Subject"] || "").slice(0, 500);
  const text = String(payload.text || payload["body-plain"] || payload["stripped-text"] || "");
  const html = sanitizeHtml(String(payload.html || payload["body-html"] || payload["stripped-html"] || ""));
  const messageId = payload.messageId || payload["Message-Id"] || null;

  const cleanFrom = extractAddress(from);
  const cleanTo = extractAddress(to);
  if (!cleanFrom || !cleanTo) return NextResponse.json({ error: "Missing from/to" }, { status: 400 });

  const recipient = await prisma.user.findUnique({ where: { email: cleanTo.toLowerCase() } });
  if (!recipient) return NextResponse.json({ error: "Unknown recipient" }, { status: 404 });

  const email = await prisma.email.create({
    data: {
      subject, bodyText: text, bodyHtml: html,
      fromAddress: cleanFrom, fromName: extractName(from) ?? null,
      toAddress: cleanTo, toName: recipient.displayName ?? recipient.username,
      folder: "INBOX", recipientId: recipient.id, isExternal: true,
      messageId: messageId || undefined,
    },
  });

  return NextResponse.json({ ok: true, id: email.id });
}

function extractAddress(s: string): string | null {
  const m = s.match(/<([^>]+)>/);
  const a = (m ? m[1] : s).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : null;
}
function extractName(s: string): string | null {
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : null;
}
