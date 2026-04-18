"use client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setErr("Invalid email or password");
    else router.push("/mail");
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md surface rounded-3xl shadow-pop border border-token p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl grid place-items-center text-white" style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }}>
            <Mail className="w-5 h-5" />
          </div>
          <span className="text-xl font-semibold">NassMail</span>
        </div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted mt-1">Sign in to your inbox.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
              className="w-full rounded-xl border border-token surface-soft px-3 py-2.5" placeholder="you@nassmail.com" />
          </Field>
          <Field label="Password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
              className="w-full rounded-xl border border-token surface-soft px-3 py-2.5" placeholder="••••••••" />
          </Field>
          {err && <div className="text-sm text-rose-600">{err}</div>}
          <button disabled={loading}
            className="w-full rounded-xl btn-brand font-medium py-2.5 disabled:opacity-60">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-6 text-sm text-muted text-center">
          New here? <Link href="/register" className="text-brand font-medium">Create an account</Link>
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
