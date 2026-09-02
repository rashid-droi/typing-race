"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminLoginShell } from "@/components/game/AdminTheme";
import { adminFetch, setToken } from "@/lib/admin-client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [company, setCompany] = useState("acme");
  const [email, setEmail] = useState("admin@typingrace.local");
  const [password, setPassword] = useState("changeme");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await adminFetch("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ company_slug: company, email, password }),
      });
      setToken(data.access_token);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLoginShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="cartoon-label">Company</span>
          <input
            className="cartoon-input"
            placeholder="Company slug"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="cartoon-label">Email</span>
          <input
            className="cartoon-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="cartoon-label">Password</span>
          <input
            type="password"
            className="cartoon-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="cartoon-error text-sm">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="cartoon-btn cartoon-btn-green w-full px-4 py-3 text-base"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <Link
        href="/"
        className="mt-4 block text-center text-sm font-bold text-blue-800 underline"
      >
        ← Player app
      </Link>
    </AdminLoginShell>
  );
}
