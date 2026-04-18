# NassMail

A clean, fast Gmail-like webmail with your own `@nassmail.com` (or any domain) addresses.
Next.js 14 · Prisma · NextAuth · Tailwind · 10 themes · provider-agnostic mailer.

```
┌─ Next.js (App Router) ────────────────────────────────────┐
│  /            landing                                      │
│  /login       sign in                                      │
│  /register    claim @<domain>                              │
│  /mail        Gmail-like client                            │
│  /api/auth/*  NextAuth credentials                         │
│  /api/me      profile + preferences                        │
│  /api/emails  list / send / patch / delete                 │
│  /api/labels  CRUD                                         │
│  /api/inbound webhook for external mail                    │
└────────────────────────────────────────────────────────────┘
```

## Features

- **NassMail-to-NassMail mail** — instant, in-DB delivery, no SMTP needed.
- **External sending** via Resend / Brevo / any SMTP — picked by env var.
- **Inbound webhook** at `/api/inbound` for Mailgun Routes, CloudMailin, Resend Inbound.
- **10 themes**: Sky, Graphite (dark), Midnight, Lavender, Crimson, Forest, Ocean, Sunset, Slate (dark), Rose.
- **3 density modes** (comfortable / default / compact).
- **3 reading-pane modes** (no split / right / below).
- **Profile pictures** (uploaded as base64 into the user record).
- **Labels** with custom colours.
- **Snooze**, **schedule send**, **mark important**, **search filters** (from / to / subject / date range / has-words).
- HTML sanitization with DOMPurify on every send and inbound message.

## Local dev (60 seconds)

```bash
npm install
cp .env.example .env
# edit .env: NEXTAUTH_SECRET=<long random>, MAIL_PROVIDER=dev is fine for now
npm run db:push
npm run dev
# open http://localhost:3000  → Register → land in /mail
```

`MAIL_PROVIDER=dev` simply logs outbound mail to the console. NassMail-to-NassMail
mail still delivers (instantly, between users in your DB).

## Configure a real mail provider

Pick one and set in `.env`:

| Provider | Free tier | Required envs |
|---|---|---|
| **Resend** (recommended) | 3 000 emails/month | `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, verified domain |
| **Brevo** | 300 emails/day | `MAIL_PROVIDER=brevo`, `BREVO_API_KEY`, verified sender |
| **SMTP** | varies | `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` |

> ⚠ Every provider that delivers to Gmail/Outlook **requires you to own the domain
> and add SPF / DKIM / DMARC DNS records**.

## Receive external mail (inbound webhook)

Point an inbound provider at:

```
POST  https://YOUR-DOMAIN/api/inbound?token=<INBOUND_WEBHOOK_SECRET>
```

The route accepts JSON or form-encoded payloads with `from`, `to`, `subject`, `text`, `html`.
Mailgun Routes, CloudMailin, and Resend Inbound all work out of the box.

## Deploy to Vercel + Neon (free)

1. **Create a Neon Postgres** (free): https://neon.tech → new project → copy the **pooled** connection string.
2. **Switch Prisma to Postgres** — open `prisma/schema.prisma` and change:

   ```diff
   - provider = "sqlite"
   + provider = "postgresql"
   ```

3. Push to GitHub, then **Vercel → New Project → import the repo**.
4. Add env vars in Vercel project settings:

   ```
   DATABASE_URL                 = <Neon pooled connection string>
   NEXTAUTH_SECRET              = <openssl rand -base64 32>
   NEXTAUTH_URL                 = https://YOUR-VERCEL-URL  (or your custom domain)
   NASS_DOMAIN                  = nassmail.com
   NEXT_PUBLIC_NASS_DOMAIN      = nassmail.com
   MAIL_PROVIDER                = resend
   RESEND_API_KEY               = ...
   INBOUND_WEBHOOK_SECRET       = <random>
   ```

5. Deploy. The `vercel.json` build command runs `prisma db push` to create the schema on first deploy.
6. **Connect your domain** — in Vercel → Domains, add `nassmail.com`. Vercel auto-issues HTTPS.
7. **Add MX + SPF + DKIM + DMARC records** at your domain DNS panel (your mail provider gives you the exact values).

## Project layout

```
src/
  app/
    page.tsx, login/, register/, mail/        # pages
    api/auth/[...nextauth]/route.ts
    api/auth/register/route.ts
    api/me/route.ts                            # profile + prefs
    api/emails/route.ts, [id]/route.ts         # CRUD + send
    api/labels/route.ts, [id]/route.ts         # labels
    api/inbound/route.ts                       # external mail webhook
  components/
    MailClient.tsx                             # main 3-pane client
    Sidebar.tsx, SettingsPanel.tsx
    SearchFilter.tsx, EmailActions.tsx
    ThemeProvider.tsx, Providers.tsx
  lib/
    prisma.ts, auth.ts, session.ts
    mailer.ts, themes.ts, utils.ts
prisma/schema.prisma
vercel.json
```

---

Built with care.
