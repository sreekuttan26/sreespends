"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, Copy, Smartphone, Wallet } from "lucide-react";
import Sheet from "./Sheet";
import type { SavedSpend } from "./SpendForm";
import { formatINR } from "@/app/lib/spends";
import {
  appsForPlatform,
  appUpiUrl,
  buildUpiQuery,
  detectPlatform,
  genericUpiUrl,
  type UpiPayload,
} from "@/app/lib/upi";

type Props = {
  spend: SavedSpend & { upi: UpiPayload };
  onDone: () => void;
};

export default function UpiAppSheet({ spend, onDone }: Props) {
  const [platform] = useState(detectPlatform);
  const [launched, setLaunched] = useState(false);
  const [copied, setCopied] = useState(false);

  const query = buildUpiQuery(spend.upi, spend.amount, spend.comment);
  const apps = appsForPlatform(platform);

  function open(url: string) {
    setLaunched(true);
    window.location.href = url;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(genericUpiUrl(query));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; nothing useful to do.
    }
  }

  return (
    <Sheet
      title="Choose a UPI app"
      subtitle={`Paying ${spend.upi.pn || spend.upi.pa}`}
      onClose={onDone}
      footer={
        <button
          onClick={onDone}
          className="h-12 w-full rounded-2xl bg-[var(--surface-2)] font-semibold transition hover:bg-[var(--border)]"
        >
          {launched ? "Done" : "I'll pay later"}
        </button>
      }
    >
      <div className="flex items-center gap-3 rounded-2xl bg-[var(--success)]/10 p-3.5 text-[var(--success)]">
        <CheckCircle2 className="h-6 w-6 shrink-0" />
        <p className="text-sm font-medium">
          {formatINR(spend.amount)} · {spend.category.emoji} {spend.category.name} saved to your spends.
        </p>
      </div>

      {platform === "desktop" ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--border)] p-5 text-center">
          <Smartphone className="mx-auto h-8 w-8 text-[var(--muted)]" />
          <p className="mt-2 font-medium">UPI apps open on your phone</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Open SreeSpends on your phone to pay with an installed UPI app.
          </p>
          <button
            onClick={copyLink}
            className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--border)]"
          >
            <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy UPI link"}
          </button>
        </div>
      ) : (
        <>
          {platform === "android" && (
            <button
              onClick={() => open(genericUpiUrl(query))}
              className="mt-5 flex w-full items-center gap-3 rounded-2xl bg-[var(--accent)] p-4 text-left text-white shadow-lg shadow-[var(--accent)]/30 transition hover:brightness-110"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20">
                <Wallet className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">Show my installed UPI apps</span>
                <span className="block text-sm opacity-80">Your phone lists every UPI app it has</span>
              </span>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <p className="label mt-6">{platform === "android" ? "Or open directly" : "Pay with"}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => open(appUpiUrl(app, query, platform))}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] p-3 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] active:scale-95"
              >
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl text-base font-bold text-white"
                  style={{ background: app.color }}
                >
                  {app.initials}
                </span>
                <span className="text-xs font-medium">{app.name}</span>
              </button>
            ))}
            {platform === "ios" && (
              <button
                onClick={() => open(genericUpiUrl(query))}
                className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] p-3 transition hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] active:scale-95"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-2)] text-[var(--muted)]">
                  <Wallet className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium">Other app</span>
              </button>
            )}
          </div>
          {launched && (
            <p className="mt-4 text-center text-sm text-[var(--muted)]">
              Didn&apos;t open? That app may not be installed — try another one.
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
