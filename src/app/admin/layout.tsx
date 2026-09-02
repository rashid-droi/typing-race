"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminRaceTrack, CartoonCar } from "@/components/game/CartoonCar";
import { CheckeredStrip, GameShell } from "@/components/game/GameShell";
import { adminFetch, getToken, setToken } from "@/lib/admin-client";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/audit", label: "Audit log" },
];

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setReady(true);
      return;
    }
    const token = getToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    adminFetch("/api/admin/me")
      .then(() => setReady(true))
      .catch(() => {
        setToken(null);
        router.replace("/admin/login");
      });
  }, [pathname, router]);

  if (pathname === "/admin/login") return children;

  if (!ready) {
    return (
      <GameShell>
        <div className="flex min-h-screen items-center justify-center p-8">
          <p className="admin-loading">Loading admin…</p>
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell>
      <div className="flex min-h-screen flex-col md:flex-row">
        <header className="px-3 pt-3 md:hidden">
          <div className="admin-sidebar p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CartoonCar color="blue" className="h-8 w-16" />
                <p className="text-sm font-extrabold text-slate-800">Race Admin</p>
              </div>
              <Link href="/" className="text-xs font-bold text-blue-800 underline">
                Players
              </Link>
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-mobile-nav-link ${navActive(pathname, item.href) ? "is-active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <aside className="hidden p-4 md:block md:w-60 md:shrink-0">
          <div className="admin-sidebar sticky top-4 p-4">
            <div className="flex items-center gap-2">
              <CartoonCar color="red" className="h-10 w-20" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Pit crew
                </p>
                <p className="text-sm font-extrabold text-slate-800">Race Admin</p>
              </div>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg">
              <CheckeredStrip />
            </div>
            <nav className="mt-4 space-y-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-link ${navActive(pathname, item.href) ? "is-active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link
              href="/"
              className="mt-6 block text-xs font-bold text-blue-800 hover:underline"
            >
              Player app →
            </Link>
            <button
              type="button"
              className="admin-sign-out mt-2"
              onClick={async () => {
                try {
                  await adminFetch("/api/admin/auth/logout", { method: "POST" });
                } catch {
                  /* ignore */
                }
                setToken(null);
                router.push("/admin/login");
              }}
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">{children}</main>
          <AdminRaceTrack />
        </div>
      </div>
    </GameShell>
  );
}
