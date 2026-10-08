"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, Pencil, Plus, QrCode, Receipt, Trash2, Wallet, X } from "lucide-react";
import QrScanner from "./QrScanner";
import Sheet from "./Sheet";
import SpendForm, { type SavedSpend } from "./SpendForm";
import UpiAppSheet from "./UpiAppSheet";
import { isFirebaseConfigured } from "@/app/Services/firebase";
import {
  DEFAULT_CATEGORIES,
  deleteSpend,
  describeFirebaseError,
  formatINR,
  subscribeCategories,
  subscribeSpends,
  todayKey,
  type Category,
  type Spend,
} from "@/app/lib/spends";
import { parseUpiQr, type UpiPayload } from "@/app/lib/upi";

type Flow =
  | { step: "idle" }
  | { step: "scan"; hint: string | null }
  | { step: "form"; upi: UpiPayload | null }
  | { step: "pay"; spend: SavedSpend & { upi: UpiPayload } }
  | { step: "edit"; spend: Spend };

const HISTORY_DAYS = 30;

export default function SpendsApp() {
  const [flow, setFlow] = useState<Flow>({ step: "idle" });
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [spends, setSpends] = useState<Spend[] | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const recentRef = useRef<HTMLElement>(null);
  const [pendingDelete, setPendingDelete] = useState<Spend | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSpend(pendingDelete.id);
      setToast(`Deleted ${formatINR(pendingDelete.amount)} spend`);
      setPendingDelete(null);
    } catch (e) {
      setDeleteError(describeFirebaseError(e));
    } finally {
      setDeleting(false);
    }
  }

  // Dates are computed on the client only, so prerendering stays deterministic.
  useEffect(() => {
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (!now || !isFirebaseConfigured) return;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const historyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - HISTORY_DAYS);
    const since = monthStart < historyStart ? monthStart : historyStart;

    const onError = (e: Error) => setLoadError(describeFirebaseError(e));
    const unsubSpends = subscribeSpends(since, setSpends, onError);
    const unsubCategories = subscribeCategories(setCustomCategories, onError);
    return () => {
      unsubSpends();
      unsubCategories();
    };
  }, [now]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const categories = useMemo(() => {
    const seen = new Set(DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase()));
    const extra = customCategories.filter((c) => !seen.has(c.name.toLowerCase()));
    // Keep "Other" last.
    const other = DEFAULT_CATEGORIES.filter((c) => c.id === "other");
    return [...DEFAULT_CATEGORIES.filter((c) => c.id !== "other"), ...extra, ...other];
  }, [customCategories]);

  const stats = useMemo(() => {
    if (!now || !spends) return null;
    const today = todayKey(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const month = spends.filter((s) => s.date >= monthStart);
    const byCategory = new Map<string, { name: string; emoji: string; total: number; count: number }>();
    for (const s of month) {
      const entry = byCategory.get(s.categoryName) ?? { name: s.categoryName, emoji: s.categoryEmoji, total: 0, count: 0 };
      entry.total += s.amount;
      entry.count += 1;
      byCategory.set(s.categoryName, entry);
    }
    return {
      today: spends.filter((s) => todayKey(s.date) === today).reduce((a, s) => a + s.amount, 0),
      month: month.reduce((a, s) => a + s.amount, 0),
      monthCount: month.length,
      categories: [...byCategory.values()].sort((a, b) => b.total - a.total),
    };
  }, [now, spends]);

  // Falls back to "all" once the category has no spends left this month (e.g. after deleting them).
  const activeCategory = stats?.categories.find((c) => c.name === categoryFilter) ?? null;

  const visibleSpends = useMemo(() => {
    if (!spends || !now || !activeCategory) return spends;
    // Match the breakdown: this month's spends in the chosen category.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return spends.filter((s) => s.categoryName === activeCategory.name && s.date >= monthStart);
  }, [spends, now, activeCategory]);

  function selectCategory(name: string) {
    const next = categoryFilter === name ? null : name;
    setCategoryFilter(next);
    // On single-column layouts the list sits below the breakdown, so bring it into view.
    if (next && !window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => recentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const grouped = useMemo(() => {
    if (!visibleSpends || !now) return [];
    const today = todayKey(now);
    const yesterday = todayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const groups = new Map<string, { label: string; total: number; items: Spend[] }>();
    for (const s of visibleSpends) {
      const key = todayKey(s.date);
      if (!groups.has(key)) {
        const label =
          key === today
            ? "Today"
            : key === yesterday
              ? "Yesterday"
              : s.date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
        groups.set(key, { label, total: 0, items: [] });
      }
      const g = groups.get(key)!;
      g.items.push(s);
      g.total += s.amount;
    }
    return [...groups.values()];
  }, [visibleSpends, now]);

  function handleScan(text: string) {
    const upi = parseUpiQr(text);
    if (upi) setFlow({ step: "form", upi });
    else setFlow({ step: "scan", hint: "That isn't a UPI payment QR. Try another code." });
  }

  function handleSaved(spend: SavedSpend) {
    if (spend.upi) setFlow({ step: "pay", spend: { ...spend, upi: spend.upi } });
    else {
      setFlow({ step: "idle" });
      setToast(`${formatINR(spend.amount)} added to ${spend.category.name}`);
    }
  }

  const monthLabel = now?.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) ?? "This month";
  const topTotal = stats?.categories[0]?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pb-12">
      <header className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">SreeSpends</h1>
            <p className="text-xs text-[var(--muted)]">Daily spend tracker</p>
          </div>
        </div>
        <button
          onClick={() => setFlow({ step: "form", upi: null })}
          className="hidden items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--surface-2)] sm:flex lg:hidden"
        >
          <Plus className="h-4 w-4" /> Add spend
        </button>
      </header>

      {!isFirebaseConfigured && (
        <Banner>
          Firebase isn&apos;t configured. Add your keys to <code>.env.local</code> and restart the dev server.
        </Banner>
      )}
      {loadError && <Banner>{loadError}</Banner>}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
        <div className="space-y-5">
          {/* Summary */}
          <section className="hero relative overflow-hidden rounded-[28px] p-6 text-white shadow-xl shadow-[var(--accent)]/20 sm:p-7">
            <p className="text-sm font-medium text-white/75">Spent in {monthLabel}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
              {stats ? formatINR(stats.month) : <span className="inline-block h-11 w-40 animate-pulse rounded-xl bg-white/20" />}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/12 p-3.5 backdrop-blur">
                <p className="text-xs text-white/70">Today</p>
                <p className="mt-0.5 text-lg font-semibold">{stats ? formatINR(stats.today) : "—"}</p>
              </div>
              <div className="rounded-2xl bg-white/12 p-3.5 backdrop-blur">
                <p className="text-xs text-white/70">Transactions</p>
                <p className="mt-0.5 text-lg font-semibold">{stats ? stats.monthCount : "—"}</p>
              </div>
            </div>
            <div className="mt-5 hidden gap-3 lg:flex">
              <button
                onClick={() => setFlow({ step: "scan", hint: null })}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-[var(--accent-strong)] transition hover:bg-white/90"
              >
                <QrCode className="h-5 w-5" /> Scan & Pay
              </button>
              <button
                onClick={() => setFlow({ step: "form", upi: null })}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 px-5 font-semibold transition hover:bg-white/25"
              >
                <Plus className="h-5 w-5" /> Add
              </button>
            </div>
          </section>

          {/* Category breakdown */}
          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold">Where it went</h2>
            <p className="text-sm text-[var(--muted)]">By category, this month · tap one to see its spends</p>
            {!stats ? (
              <SkeletonRows />
            ) : stats.categories.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--muted)]">No spends this month yet.</p>
            ) : (
              <ul className="mt-4 select-none space-y-1 [-webkit-touch-callout:none]">
                {stats.categories.map((c) => {
                  const active = activeCategory?.name === c.name;
                  const dimmed = activeCategory && !active;
                  return (
                    <li key={c.name}>
                      <button
                        onClick={() => selectCategory(c.name)}
                        aria-pressed={active}
                        className={`-mx-3 block w-[calc(100%+1.5rem)] rounded-2xl px-3 py-2.5 text-left transition ${
                          active ? "bg-[var(--accent)]/10" : "hover:bg-[var(--surface-2)]"
                        } ${dimmed ? "opacity-55" : ""}`}
                      >
                        <span className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2 font-medium">
                            <span aria-hidden>{c.emoji}</span>
                            <span className="truncate">{c.name}</span>
                            <span className="shrink-0 text-xs font-normal text-[var(--muted)]">· {c.count}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 tabular-nums text-[var(--muted)]">
                            {formatINR(c.total)}
                            <ChevronRight
                              className={`h-4 w-4 transition ${active ? "rotate-90 text-[var(--accent)]" : ""}`}
                            />
                          </span>
                        </span>
                        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <span
                            className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-700"
                            style={{ width: `${Math.max(4, (c.total / topTotal) * 100)}%` }}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Recent spends */}
        <section ref={recentRef} className="card scroll-mt-4 p-5 sm:p-6">
          {activeCategory ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-semibold">
                  <span aria-hidden>{activeCategory.emoji}</span>
                  <span className="truncate">{activeCategory.name}</span>
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  {monthLabel} · {activeCategory.count} {activeCategory.count === 1 ? "spend" : "spends"} ·{" "}
                  {formatINR(activeCategory.total)}
                </p>
              </div>
              <button
                onClick={() => setCategoryFilter(null)}
                className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--border)]"
              >
                <X className="h-3.5 w-3.5" /> Show all
              </button>
            </div>
          ) : (
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Recent spends</h2>
              <span className="text-xs text-[var(--muted)]">Last {HISTORY_DAYS} days</span>
            </div>
          )}
          {!spends && !loadError ? (
            <SkeletonRows />
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--muted)]">
                <Receipt className="h-6 w-6" />
              </span>
              <p className="mt-3 font-medium">No spends yet</p>
              <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">Scan a UPI QR or add a spend to start tracking.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {grouped.map((g) => (
                <div key={g.label}>
                  <div className="mb-1 flex justify-between text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                    <span>{g.label}</span>
                    <span className="tabular-nums">{formatINR(g.total)}</span>
                  </div>
                  <ul className="select-none divide-y divide-[var(--border)] [-webkit-touch-callout:none]">
                    {g.items.map((s) => (
                      <li key={s.id} className="flex items-center gap-1">
                        <button
                          onClick={() => setFlow({ step: "edit", spend: s })}
                          aria-label={`Edit ${formatINR(s.amount)} spend`}
                          className="-ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-[var(--surface-2)] active:scale-[0.99]"
                        >
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-xl" aria-hidden>
                            {s.categoryEmoji}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{s.payeeName || s.comment || s.categoryName}</span>
                            <span className="block truncate text-sm text-[var(--muted)]">
                              {s.categoryName}
                              {s.payeeName && s.comment ? ` · ${s.comment}` : ""}
                              {s.source !== "manual" ? " · UPI" : ""}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">−{formatINR(s.amount)}</span>
                        </button>
                        <button
                          onClick={() => setFlow({ step: "edit", spend: s })}
                          aria-label={`Edit ${formatINR(s.amount)} spend`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(s);
                          }}
                          aria-label={`Delete ${formatINR(s.amount)} spend`}
                          className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--muted)] transition hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Mobile / tablet action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 lg:hidden">
        <div className="mx-auto flex max-w-md gap-3">
          <button
            onClick={() => setFlow({ step: "form", upi: null })}
            aria-label="Add spend manually"
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-lg transition active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </button>
          <button
            onClick={() => setFlow({ step: "scan", hint: null })}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-base font-semibold text-white shadow-xl shadow-[var(--accent)]/35 transition active:scale-[0.98]"
          >
            <QrCode className="h-5 w-5" /> Scan & Pay
          </button>
        </div>
      </div>

      {flow.step === "scan" && (
        <QrScanner hint={flow.hint} onResult={handleScan} onClose={() => setFlow({ step: "idle" })} />
      )}
      {flow.step === "form" && (
        <SpendForm
          upi={flow.upi}
          categories={categories}
          onClose={() => setFlow({ step: "idle" })}
          onSaved={handleSaved}
        />
      )}
      {flow.step === "edit" && (
        <SpendForm
          upi={null}
          editing={flow.spend}
          categories={categories}
          onClose={() => setFlow({ step: "idle" })}
          onSaved={handleSaved}
          onUpdated={(spend) => {
            setFlow({ step: "idle" });
            setToast(`Updated ${formatINR(spend.amount)} spend`);
          }}
        />
      )}
      {flow.step === "pay" && <UpiAppSheet spend={flow.spend} onDone={() => setFlow({ step: "idle" })} />}

      {pendingDelete && (
        <Sheet
          title="Delete this spend?"
          subtitle="This removes it from your history permanently."
          onClose={deleting ? undefined : () => setPendingDelete(null)}
          footer={
            <>
              {deleteError && (
                <p role="alert" className="mb-3 rounded-xl bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
                  {deleteError}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingDelete(null)}
                  disabled={deleting}
                  className="h-12 flex-1 rounded-2xl bg-[var(--surface-2)] font-semibold transition hover:bg-[var(--border)] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--danger)] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </>
          }
        >
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--surface)] text-xl" aria-hidden>
              {pendingDelete.categoryEmoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {pendingDelete.payeeName || pendingDelete.comment || pendingDelete.categoryName}
              </p>
              <p className="truncate text-sm text-[var(--muted)]">
                {pendingDelete.categoryName} ·{" "}
                {pendingDelete.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatINR(pendingDelete.amount)}</span>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            This only removes it from SreeSpends. It doesn&apos;t cancel or refund a UPI payment.
          </p>
        </Sheet>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-28 z-50 flex justify-center px-4 lg:bottom-8" role="status">
          <div className="fade-in flex items-center gap-2 rounded-full bg-[var(--fg)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] shadow-xl">
            <CheckCircle2 className="h-4 w-4" /> {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[var(--warn)]/30 bg-[var(--warn)]/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      <p>{children}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="mt-5 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-11 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      ))}
    </div>
  );
}
