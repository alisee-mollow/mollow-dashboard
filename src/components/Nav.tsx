"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Synthèse" },
  { href: "/creances", label: "Créances et devis" },
  { href: "/depenses", label: "Dépenses" },
  { href: "/revenus", label: "Revenus" },
  { href: "/ca", label: "Chiffre d'affaires" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b-2 border-[var(--brand-burgundy)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-4">
        <span className="font-semibold tracking-tight text-[var(--brand-burgundy)] dark:text-[var(--brand-pink)]">
          Mollow · Trésorerie
        </span>
        <nav className="flex flex-wrap gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]"
                    : "text-zinc-600 hover:bg-[var(--brand-blush)] dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
