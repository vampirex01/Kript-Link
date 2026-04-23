"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

const items = [
  { href: "/dashboard", label: "Links" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const navItems =
    user?.role === "OWNER"
      ? [...items, { href: "/dashboard/admin", label: "Admin" }]
      : items;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 rounded-2xl border border-ink/10 bg-white/80 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="font-display text-2xl text-ink">
            ShortURL
          </Link>
          <nav className="flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  pathname === item.href
                    ? "bg-ink text-white"
                    : "text-ink/70 hover:bg-ink/10",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-lg border border-ink/20 px-3 py-2 text-sm font-semibold text-ink hover:bg-ink/10"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </header>
      <div className="page-enter">{children}</div>
    </div>
  );
}
