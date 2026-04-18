import Link from "next/link";
import { Mail, Shield, Zap, Send } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-xl font-semibold tracking-tight">NassMail</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-muted hover:text-token">Sign in</Link>
          <Link href="/register"
            className="btn-brand rounded-full text-sm font-medium px-4 py-2 hover-lift">
            Create account
          </Link>
        </nav>
      </header>

      <main className="flex-1 grid place-items-center px-6">
        <div className="max-w-3xl text-center anim-up">
          <div className="inline-flex items-center gap-2 rounded-full surface shadow-soft px-3 py-1 text-xs font-medium text-muted mb-6 border border-token">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Your own @nassmail.com address
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Email, <span className="brand-grad">reimagined</span>.
          </h1>
          <p className="mt-5 text-lg text-muted">
            A clean, fast mail client with built-in accounts, instant delivery between NassMail users,
            and external sending via any provider you choose.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/register"
              className="rounded-full bg-[color:var(--text)] text-[color:var(--bg)] text-sm font-medium px-5 py-3 hover-lift">
              Get your address
            </Link>
            <Link href="/login"
              className="rounded-full surface shadow-soft text-sm font-medium px-5 py-3 hover-lift border border-token">
              Sign in
            </Link>
          </div>
          <div className="mt-14 grid sm:grid-cols-3 gap-4 text-left">
            <Feature icon={<Zap className="w-5 h-5" />} title="Instant between users" body="Mail sent to another NassMail address is delivered in milliseconds." />
            <Feature icon={<Send className="w-5 h-5" />} title="Send anywhere" body="Resend, Brevo, or SMTP — swap by env var." />
            <Feature icon={<Shield className="w-5 h-5" />} title="Yours to host" body="Deploy on Vercel + Neon. Your data, your rules." />
          </div>
        </div>
      </main>
      <footer className="text-center text-xs text-subtle py-6">© NassMail</footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl surface shadow-soft p-5 border border-token hover-lift">
      <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand grid place-items-center mb-3">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted mt-1">{body}</div>
    </div>
  );
}

function Logo() {
  return (
    <div className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-pop"
         style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }}>
      <Mail className="w-5 h-5" />
    </div>
  );
}
