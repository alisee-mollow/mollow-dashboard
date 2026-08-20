"use client";

export function RefreshButton({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {loading ? "Actualisation…" : "Rafraîchir"}
    </button>
  );
}
