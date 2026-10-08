"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, Loader2, Lock, MessageSquareText, Store } from "lucide-react";
import CategoryPicker from "./CategoryPicker";
import PayeeInput, { type PayeeValue } from "./PayeeInput";
import Sheet from "./Sheet";
import {
  describeFirebaseError,
  formatINR,
  saveSpend,
  todayKey,
  type Category,
} from "@/app/lib/spends";
import type { UpiPayload } from "@/app/lib/upi";

export type SavedSpend = {
  id: string;
  amount: number;
  comment: string;
  category: Category;
  upi: UpiPayload | null;
};

type Props = {
  upi: UpiPayload | null;
  categories: Category[];
  onClose: () => void;
  onSaved: (spend: SavedSpend) => void;
};

export default function SpendForm({ upi, categories, onClose, onSaved }: Props) {
  const amountLocked = Boolean(upi?.am);
  const [amount, setAmount] = useState(upi?.am ? upi.am.toFixed(2) : "");
  const [dateKey, setDateKey] = useState(() => todayKey());
  const [maxDate] = useState(() => todayKey());
  const [category, setCategory] = useState<Category | null>(null);
  const [comment, setComment] = useState(upi?.tn ?? "");
  const [payee, setPayee] = useState<PayeeValue>({ entered: false, payment: null, problem: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValue = Number(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue > 0;
  const willPay = Boolean(upi) || payee.entered;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!amountValid) return setError("Enter an amount greater than ₹0.");
    if (willPay && amountValue > 500000) return setError("UPI payments are capped at ₹5,00,000.");
    if (!category) return setError("Pick a category for this spend.");
    if (!dateKey) return setError("Pick a date.");
    if (!upi && payee.problem) return setError(payee.problem);

    setSaving(true);
    setError(null);
    try {
      const rounded = Math.round(amountValue * 100) / 100;
      const payment = upi ?? payee.payment;
      const id = await saveSpend({ amount: rounded, category, dateKey, comment, upi: payment });
      onSaved({ id, amount: rounded, comment, category, upi: payment });
    } catch (err) {
      setError(describeFirebaseError(err));
      setSaving(false);
    }
  }

  return (
    <Sheet
      title={upi ? "Pay & track" : "Add a spend"}
      subtitle={upi ? "Details are saved before you pay" : "Log a cash spend, or pay a UPI ID"}
      onClose={saving ? undefined : onClose}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <button
            type="submit"
            form="spend-form"
            disabled={saving}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-base font-semibold text-white shadow-lg shadow-[var(--accent)]/30 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                {willPay ? "Proceed to pay" : "Save spend"}
                {amountValid && <span className="opacity-80">· {formatINR(amountValue)}</span>}
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </>
      }
    >
      <form id="spend-form" onSubmit={submit} className="space-y-6 pt-2">
        {upi && (
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-3.5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <Store className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{upi.pn || "UPI payee"}</p>
              <p className="truncate text-sm text-[var(--muted)]">{upi.pa}</p>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="amount" className="label">
            Amount
          </label>
          <div
            className={`flex items-center gap-2 rounded-2xl border-2 px-4 transition focus-within:border-[var(--accent)] ${
              amountLocked ? "border-transparent bg-[var(--surface-2)]" : "border-[var(--border)]"
            }`}
          >
            <span className="text-3xl font-semibold text-[var(--muted)]">₹</span>
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={!amountLocked}
              readOnly={amountLocked}
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                if (/^\d{0,7}(\.\d{0,2})?$/.test(v)) setAmount(v);
              }}
              placeholder="0"
              className="h-16 min-w-0 flex-1 bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-[var(--border)]"
            />
            {amountLocked && <Lock className="h-4 w-4 text-[var(--muted)]" aria-label="Set by QR code" />}
          </div>
          {amountLocked && (
            <p className="mt-1.5 text-xs text-[var(--muted)]">Amount is fixed by the merchant&apos;s QR code.</p>
          )}
        </div>

        {!upi && <PayeeInput onChange={setPayee} />}

        <div>
          <label htmlFor="date" className="label">
            Date
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              id="date"
              type="date"
              value={dateKey}
              max={maxDate}
              onChange={(e) => setDateKey(e.target.value)}
              className="field w-full pl-12"
            />
          </div>
        </div>

        <div>
          <span className="label">Category</span>
          <CategoryPicker
            categories={categories}
            selectedId={category?.id ?? null}
            onSelect={(c) => {
              setCategory(c);
              setError(null);
            }}
          />
        </div>

        <div>
          <label htmlFor="comment" className="label">
            Comment <span className="font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <div className="relative">
            <MessageSquareText className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-[var(--muted)]" />
            <textarea
              id="comment"
              rows={2}
              maxLength={200}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Lunch with team"
              className="field w-full resize-none py-3 pl-12"
            />
          </div>
        </div>
      </form>
    </Sheet>
  );
}
