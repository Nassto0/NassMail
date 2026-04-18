"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Mail } from "lucide-react";

const NASS_DOMAIN = process.env.NEXT_PUBLIC_NASS_DOMAIN || "nassmail.com";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, displayName, password }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || "Could not register"); setLoading(false); return; }
    const sign = await signIn("credentials", { email: data.user.email, password, redirect: false });
    setLoading(false);
    if (sign?.error) setErr("Created account but couldn't sign in. Try signing in manually.");
    else router.push("/mail");
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md surface rounded-3xl shadow-pop border border-token p-8 anim-up">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl grid place-items-center text-white"
               style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }}>
            <Mail className="w-5 h-5" />
          </div>
          <span className="text-xl font-semibold">NassMail</span>
        </div>
        <h1 className="text-2xl font-semibold">Claim your address</h1>
        <p className="text-sm text-muted mt-1">Pick a username — that's your @{NASS_DOMAIN} email.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Display name">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={1} maxLength={64}
              className="w-full rounded-xl border border-token surface-soft px-3 py-2.5" placeholder="Ada Lovelace" />
          </Field>
          <Field label="Username">
            <div className="flex rounded-xl border border-token overflow-hidden">
              <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required
                pattern="^[a-z0-9._-]+$" minLength={3} maxLength={32}
                className="flex-1 px-3 py-2.5 outline-none surface-soft" placeholder="ada" />
              <span className="px-3 py-2.5 surface text-muted text-sm border-l border-token">@{NASS_DOMAIN}</span>
            </div>
          </Field>
          <Field label="Password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8}
              className="w-full rounded-xl border border-token surface-soft px-3 py-2.5" placeholder="At least 8 characters" />
          </Field>
          {err && <div className="text-sm text-danger">{err}</div>}
          <button disabled={loading} className="w-full rounded-xl btn-brand font-medium py-2.5 disabled:opacity-60">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <div className="mt-6 text-sm text-muted text-center">
          Already have an account? <Link href="/login" className="text-brand font-medium">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-token">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
