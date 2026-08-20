"use client";

export function RefreshButton({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {loading ? "Actualisation…" : "Rafraîchir"}
    </button>
  );
}
