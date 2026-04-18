import nodemailer from "nodemailer";

export type OutboundMail = {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendResult = { messageId?: string; provider: string; accepted: boolean; info?: any };

const provider = (process.env.MAIL_PROVIDER || "dev").toLowerCase();

async function sendResend(m: OutboundMail): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: m.fromName ? `${m.fromName} <${m.from}>` : m.from,
      to: [m.to],
      subject: m.subject,
      text: m.text,
      html: m.html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend: ${res.status} ${JSON.stringify(data)}`);
  return { messageId: data.id, provider: "resend", accepted: true, info: data };
}

async function sendBrevo(m: OutboundMail): Promise<SendResult> {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("BREVO_API_KEY missing");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: m.from, name: m.fromName ?? m.from },
      to: [{ email: m.to }],
      subject: m.subject,
      textContent: m.text,
      htmlContent: m.html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo: ${res.status} ${JSON.stringify(data)}`);
  return { messageId: data.messageId, provider: "brevo", accepted: true, info: data };
}

async function sendSmtp(m: OutboundMail): Promise<SendResult> {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST missing");
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  const info = await transporter.sendMail({
    from: m.fromName ? `"${m.fromName}" <${m.from}>` : m.from,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
  });
  return { messageId: info.messageId, provider: "smtp", accepted: true, info };
}

async function sendDev(m: OutboundMail): Promise<SendResult> {
  console.log("[NassMail dev mailer] (not actually sent)", {
    from: m.from, to: m.to, subject: m.subject,
  });
  return { messageId: `dev-${Date.now()}`, provider: "dev", accepted: true };
}

/**
 * Sends an email to an external address via the configured provider.
 * For NassMail-to-NassMail mail we store directly in the DB and skip this.
 */
export async function sendExternal(m: OutboundMail): Promise<SendResult> {
  switch (provider) {
    case "resend": return sendResend(m);
    case "brevo":  return sendBrevo(m);
    case "smtp":   return sendSmtp(m);
    case "dev":
    default:       return sendDev(m);
  }
}

export function isNassAddress(addr: string) {
  const domain = (process.env.NASS_DOMAIN || "nassmail.com").toLowerCase();
  return addr.toLowerCase().endsWith(`@${domain}`);
}
