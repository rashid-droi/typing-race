"use client";

import Link from "next/link";
import { CartoonCar } from "./CartoonCar";
import { CheckeredStrip, GameShell } from "./GameShell";

export function AdminPageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h1 className="cartoon-title text-left text-3xl sm:text-4xl">{title}</h1>
      {subtitle && (
        <p className="cartoon-subtitle mt-2 text-sm font-semibold">{subtitle}</p>
      )}
    </div>
  );
}

export function AdminCard({
  children,
  className = "",
  accent = false,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`cartoon-card p-4 sm:p-5 ${accent ? "admin-card-accent" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function AdminStatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cartoon-card admin-stat-card p-4">
      <CartoonCar
        color={(["red", "blue", "yellow", "green"] as const)[label.length % 4]}
        className="admin-stat-car h-10 w-20"
      />
      <p className="cartoon-label mt-3">{label}</p>
      <p className="mt-1 text-3xl font-extrabold text-slate-800">{value}</p>
    </div>
  );
}

export function AdminSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="cartoon-label text-sm">{children}</h2>
  );
}

export function AdminStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "admin-badge-draft",
    scheduled: "admin-badge-scheduled",
    lobby_open: "admin-badge-lobby",
    in_progress: "admin-badge-live",
    finished: "admin-badge-finished",
    archived: "admin-badge-archived",
    cancelled: "admin-badge-cancelled",
  };
  return (
    <span className={`admin-status-badge ${styles[status] ?? "admin-badge-draft"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function AdminButton({
  children,
  onClick,
  disabled,
  variant = "outline",
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "green" | "yellow" | "blue" | "outline";
  type?: "button" | "submit";
  className?: string;
}) {
  const variantClass = {
    green: "cartoon-btn-green",
    yellow: "cartoon-btn-yellow",
    blue: "cartoon-btn-blue",
    outline: "cartoon-btn-outline",
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`cartoon-btn ${variantClass} px-4 py-2.5 text-sm ${className}`}
    >
      {children}
    </button>
  );
}

export function AdminLinkButton({
  href,
  children,
  variant = "outline",
  className = "",
  target,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "green" | "yellow" | "blue" | "outline";
  className?: string;
  target?: string;
}) {
  const variantClass = {
    green: "cartoon-btn-green",
    yellow: "cartoon-btn-yellow",
    blue: "cartoon-btn-blue",
    outline: "cartoon-btn-outline",
  }[variant];
  return (
    <Link
      href={href}
      target={target}
      className={`cartoon-btn ${variantClass} px-4 py-2.5 text-sm no-underline ${className}`}
    >
      {children}
    </Link>
  );
}

export function AdminTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="admin-table w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function AdminLoginShell({ children }: { children: React.ReactNode }) {
  return (
    <GameShell>
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-4 flex justify-center">
          <CartoonCar color="yellow" className="h-16 w-32" />
        </div>
        <div className="text-center">
          <span className="cartoon-banner text-xs font-bold uppercase tracking-widest text-slate-600">
            Pit lane
          </span>
        </div>
        <h1 className="cartoon-title mt-3 text-center text-4xl">Admin</h1>
        <div className="mt-4">
          <CheckeredStrip />
        </div>
        <div className="cartoon-card mt-6 p-5">{children}</div>
      </main>
    </GameShell>
  );
}
