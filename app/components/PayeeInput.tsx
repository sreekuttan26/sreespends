"use client";

import { useEffect, useState } from "react";
import { AtSign, BookUser, Check, Phone } from "lucide-react";
import {
  isValidVpa,
  normalizeMobile,
  suggestVpas,
  upiFromVpa,
  type UpiPayload,
} from "@/app/lib/upi";

export type PayeeValue = {
  /** Something was typed, so the user intends to pay */
  entered: boolean;
  /** Ready-to-pay payload, or null if nothing usable yet */
  payment: UpiPayload | null;
  /** Why `payment` is null despite `entered` */
  problem: string | null;
};

type ContactsManager = {
  select: (
    props: string[],
    opts?: { multiple?: boolean },
  ) => Promise<{ name?: string[]; tel?: string[] }[]>;
};

type Mode = "upi" | "mobile";

export default function PayeeInput({ onChange }: { onChange: (value: PayeeValue) => void }) {
  const [mode, setMode] = useState<Mode>("mobile");
  const [upiId, setUpiId] = useState("");
  const [mobile, setMobile] = useState("");
  const [contactName, setContactName] = useState<string | null>(null);
  const [selectedVpa, setSelectedVpa] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactsManager | null>(null);

  // Contact Picker API exists on Android Chrome; detect after mount.
  useEffect(() => {
    const nav = navigator as Navigator & { contacts?: ContactsManager };
    if (nav.contacts?.select) setContacts(nav.contacts);
  }, []);

  const mobileDigits = normalizeMobile(mobile);
  const suggestions = mobileDigits ? suggestVpas(mobileDigits) : [];

  useEffect(() => {
    if (mode === "upi") {
      const entered = upiId.trim() !== "";
      const valid = isValidVpa(upiId);
      onChange({
        entered,
        payment: entered && valid ? upiFromVpa(upiId) : null,
        problem: entered && !valid ? "Enter a valid UPI ID, like name@okaxis." : null,
      });
      return;
    }
    const entered = mobile.trim() !== "";
    onChange({
      entered,
      payment:
        mobileDigits && selectedVpa
          ? upiFromVpa(selectedVpa, contactName ?? undefined, mobileDigits)
          : null,
      problem: !entered
        ? null
        : !mobileDigits
          ? "Enter a valid 10-digit mobile number."
          : !selectedVpa
            ? "Pick which UPI app they use, or enter their UPI ID."
            : null,
    });
  }, [mode, upiId, mobile, mobileDigits, selectedVpa, contactName, onChange]);

  function changeMobile(value: string) {
    setMobile(value.replace(/[^\d+\s-]/g, "").slice(0, 16));
    setSelectedVpa(null);
    setContactName(null);
  }

  async function pickContact() {
    if (!contacts) return;
    try {
      const [picked] = await contacts.select(["name", "tel"], { multiple: false });
      if (!picked) return;
      const number = picked.tel?.map(normalizeMobile).find(Boolean);
      setMobile(number ?? picked.tel?.[0] ?? "");
      setSelectedVpa(null);
      setContactName(picked.name?.[0] ?? null);
    } catch {
      // User dismissed the picker.
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label mb-0">
          Pay to <span className="font-normal normal-case tracking-normal">(optional)</span>
        </span>
        <div role="tablist" className="flex rounded-full bg-[var(--surface-2)] p-1 text-xs font-semibold">
          {(["mobile", "upi"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1.5 transition ${
                mode === m ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm" : "text-[var(--muted)]"
              }`}
            >
              {m === "mobile" ? "Mobile no." : "UPI ID"}
            </button>
          ))}
        </div>
      </div>

      {mode === "upi" ? (
        <>
          <div className="relative">
            <AtSign className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              aria-label="UPI ID"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value.replace(/\s/g, ""))}
              placeholder="name@okaxis"
              aria-invalid={upiId.trim() !== "" && !isValidVpa(upiId)}
              className="field w-full pl-12"
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {upiId.trim() === ""
              ? "Leave empty for cash or other payments."
              : isValidVpa(upiId)
                ? "After saving, you'll pick a UPI app to pay this ID."
                : "Should look like name@bank."}
          </p>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Phone className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                aria-label="Mobile number"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={mobile}
                onChange={(e) => changeMobile(e.target.value)}
                placeholder="98765 43210"
                aria-invalid={mobile.trim() !== "" && !mobileDigits}
                className="field w-full pl-12"
              />
            </div>
            {contacts && (
              <button
                type="button"
                onClick={pickContact}
                aria-label="Pick from contacts"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[0.875rem] border-[1.5px] border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <BookUser className="h-5 w-5" />
              </button>
            )}
          </div>

          {contactName && (
            <p className="mt-1.5 text-xs font-medium">Paying {contactName}</p>
          )}

          {!mobileDigits ? (
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              {mobile.trim() === ""
                ? "Leave empty for cash or other payments."
                : "Enter a 10-digit mobile number."}
            </p>
          ) : (
            <div className="mt-3 fade-in">
              <p className="mb-2 text-xs text-[var(--muted)]">Which UPI app do they use?</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => {
                  const active = selectedVpa === s.vpa;
                  return (
                    <button
                      key={s.vpa}
                      type="button"
                      onClick={() => setSelectedVpa(active ? null : s.vpa)}
                      aria-pressed={active}
                      className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-transparent bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25"
                          : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]/50"
                      }`}
                    >
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        {active && <Check className="h-3 w-3" />}
                        {s.app}
                      </span>
                      <span className={`text-[11px] ${active ? "text-white/80" : "text-[var(--muted)]"}`}>
                        @{s.vpa.split("@")[1]}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setUpiId(`${mobileDigits}@`);
                    setMode("upi");
                  }}
                  className="rounded-xl border border-dashed border-[var(--accent)]/60 px-3 py-2 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
                >
                  Other…
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {selectedVpa
                  ? `Will pay ${selectedVpa}. Your UPI app shows the account holder's name, so check it before paying.`
                  : "Google Pay IDs aren't based on mobile numbers. For those, ask for their UPI ID."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
