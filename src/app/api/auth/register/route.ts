import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NASS_DOMAIN } from "@/lib/utils";

const schema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9._-]+$/i, "Only letters, numbers, . _ - allowed"),
  displayName: z.string().min(1).max(64),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const username = parsed.data.username.toLowerCase();
    const email = `${username}@${NASS_DOMAIN}`;
    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
    if (existing) return NextResponse.json({ error: "Username already taken" }, { status: 409 });

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.user.create({
      data: { email, username, displayName: parsed.data.displayName, passwordHash },
      select: { id: true, email: true, username: true, displayName: true },
    });

    // Seed a friendly welcome email into the user's inbox.
    await prisma.email.create({
      data: {
        subject: "Welcome to NassMail 👋",
        fromAddress: `team@${NASS_DOMAIN}`,
        fromName: "NassMail Team",
        toAddress: email,
        toName: user.displayName ?? user.username,
        recipientId: user.id,
        folder: "INBOX",
        bodyText:
          "Welcome to NassMail!\n\nThis is your inbox. You can send mail to any NassMail user right away. " +
          "To send to external addresses (Gmail/Outlook), set MAIL_PROVIDER and credentials in your .env.\n\n— The NassMail Team",
        bodyHtml:
          `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#111">
             <h2 style="margin:0 0 8px">Welcome to NassMail 👋</h2>
             <p>This is your inbox. You can send mail to any NassMail user right away.</p>
             <p>To send to external addresses, configure a mail provider in your environment.</p>
             <p style="color:#666">— The NassMail Team</p>
           </div>`,
      },
    });

    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Registration failed" }, { status: 500 });
  }
}
