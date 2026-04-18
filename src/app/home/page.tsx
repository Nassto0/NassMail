import Link from "next/link";
import { Mail, Heart, Lock, Sparkles } from "lucide-react";

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
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> No ads. No trackers. No gimmicks.
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Your inbox, <span className="brand-grad">finally yours</span>.
          </h1>
          <p className="mt-5 text-lg text-muted">
            A calm, beautiful email account that doesn&apos;t read your mail, doesn&apos;t sell your habits,
            and doesn&apos;t cost a thing. Keep in touch with the people you love — the way email was meant to be.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/register"
              className="rounded-full bg-[color:var(--text)] text-[color:var(--bg)] text-sm font-medium px-5 py-3 hover-lift">
              Claim your address — it&apos;s free
            </Link>
            <Link href="/login"
              className="rounded-full surface shadow-soft text-sm font-medium px-5 py-3 hover-lift border border-token">
              I already have one
            </Link>
          </div>
          <div className="mt-14 grid sm:grid-cols-3 gap-4 text-left">
            <Feature
              icon={<Lock className="w-5 h-5" />}
              title="Private by default"
              body="We don&apos;t scan your messages or profile you. Your mail is yours — we just deliver it."
            />
            <Feature
              icon={<Heart className="w-5 h-5" />}
              title="Built for real people"
              body="Clean inbox, fast search, labels that make sense. No bloat, no pop-ups, no upsells."
            />
            <Feature
              icon={<Sparkles className="w-5 h-5" />}
              title="Free — forever"
              body="No trial. No card. Send and receive anywhere in the world, powered by free providers you control."
            />
          </div>
        </div>
      </main>
      <footer className="text-center text-xs text-subtle py-6">© NassMail — made with care</footer>
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
