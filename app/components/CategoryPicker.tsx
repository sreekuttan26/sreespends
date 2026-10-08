"use client";

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { describeFirebaseError, saveCategory, type Category } from "@/app/lib/spends";

const EMOJIS = ["🏷️", "☕", "🍕", "🏠", "🎁", "📚", "✈️", "🐾", "👕", "💇", "🏋️", "🎮", "📱", "🚗", "💼", "🧾"];

type Props = {
  categories: Category[];
  selectedId: string | null;
  onSelect: (category: Category) => void;
};

export default function CategoryPicker({ categories, selectedId, onSelect }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      onSelect(existing);
      reset();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSelect(await saveCategory(trimmed, emoji));
      reset();
    } catch (e) {
      setError(describeFirebaseError(e));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setAdding(false);
    setName("");
    setEmoji(EMOJIS[0]);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                active
                  ? "border-transparent bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25"
                  : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]/50"
              }`}
            >
              <span aria-hidden>{c.emoji}</span>
              {c.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--accent)]/60 px-3.5 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 fade-in">
          <div className="flex gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              maxLength={30}
              placeholder="Category name"
              className="field min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={add}
              disabled={!name.trim() || saving}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white transition disabled:opacity-40"
              aria-label="Add category"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={emoji === e}
                onClick={() => setEmoji(e)}
                className={`grid h-9 w-9 place-items-center rounded-lg text-lg transition ${
                  emoji === e ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]" : "hover:bg-[var(--border)]"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : <span />}
            <button type="button" onClick={reset} className="text-xs font-medium text-[var(--muted)] hover:text-[var(--fg)]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
