// Helpers for UPI QR codes (upi://pay?pa=...&pn=...&am=...) and payment intents.

export type UpiPayload = {
  /** Payee VPA, e.g. merchant@okaxis */
  pa: string;
  /** Payee name */
  pn?: string;
  /** Amount fixed by the QR, if any */
  am?: number;
  /** Transaction note from the QR */
  tn?: string;
  /** Every original query param, preserved so merchant QRs (mc, tr, sign...) still work */
  params: Record<string, string>;
  raw: string;
  /** Mobile number the UPI ID was derived from, if any */
  mobile?: string;
  /** Scanned from a QR, or typed in on the manual form */
  origin: "qr" | "manual";
};

const VPA_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

export function isValidVpa(vpa: string) {
  return VPA_PATTERN.test(vpa.trim());
}

/** Payload for a UPI ID typed in by hand (no QR). */
export function upiFromVpa(vpa: string, name?: string, mobile?: string): UpiPayload {
  const pa = vpa.trim().toLowerCase();
  const params: Record<string, string> = { pa };
  if (name?.trim()) params.pn = name.trim();
  return {
    pa,
    pn: params.pn,
    mobile,
    params,
    raw: `upi://pay?pa=${pa}`,
    origin: "manual",
  };
}

/** Returns the 10-digit Indian mobile number, accepting +91 / 0 prefixes and spaces. */
export function normalizeMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

// Apps that create UPI IDs from the user's mobile number. Google Pay isn't here:
// its IDs are based on the Gmail username, not the number.
const MOBILE_HANDLES = [
  { handle: "ybl", app: "PhonePe" },
  { handle: "paytm", app: "Paytm" },
  { handle: "upi", app: "BHIM" },
  { handle: "apl", app: "Amazon Pay" },
  { handle: "ibl", app: "PhonePe" },
  { handle: "axl", app: "PhonePe" },
  { handle: "ptyes", app: "Paytm" },
  { handle: "airtel", app: "Airtel" },
  { handle: "freecharge", app: "Freecharge" },
  { handle: "ikwik", app: "MobiKwik" },
];

/** Likely UPI IDs for a mobile number. Unverified — the UPI app shows the real name before paying. */
export function suggestVpas(mobile: string) {
  return MOBILE_HANDLES.map(({ handle, app }) => ({ vpa: `${mobile}@${handle}`, app }));
}

export function parseUpiQr(text: string): UpiPayload | null {
  const raw = text.trim();
  if (!/^upi:\/\/pay\?/i.test(raw)) return null;

  const query = raw.slice(raw.indexOf("?") + 1);
  const params: Record<string, string> = {};
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = (eq === -1 ? part : part.slice(0, eq)).toLowerCase();
    const value = eq === -1 ? "" : part.slice(eq + 1);
    params[key] = safeDecode(value);
  }

  if (!params.pa) return null;

  const am = params.am ? Number(params.am) : NaN;
  return {
    pa: params.pa,
    pn: params.pn || undefined,
    am: Number.isFinite(am) && am > 0 ? am : undefined,
    tn: params.tn || undefined,
    params,
    raw,
    origin: "qr",
  };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

// Some UPI apps choke on an encoded "@" in the VPA or "+" for spaces, so encode conservatively.
function encode(value: string) {
  return encodeURIComponent(value).replace(/%40/g, "@");
}

/** Builds the query string for a payment, keeping the QR's own params intact. */
export function buildUpiQuery(
  payload: UpiPayload,
  amount: number,
  note?: string,
): string {
  const params: Record<string, string> = { ...payload.params };
  // Never override a merchant-fixed amount or note — signed QRs would be rejected.
  if (!payload.am) params.am = amount.toFixed(2);
  if (!params.cu) params.cu = "INR";
  if (!params.tn && note) params.tn = note.slice(0, 50);

  return Object.entries(params)
    .map(([k, v]) => `${k}=${encode(v)}`)
    .join("&");
}

export type Platform = "android" | "ios" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS reports itself as Mac; detect via touch support.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "desktop";
}

export type UpiApp = {
  id: string;
  name: string;
  /** Android package name — used with intent:// so Chrome opens exactly this app */
  androidPackage?: string;
  /** iOS URL scheme prefix (query is appended) */
  iosPrefix?: string;
  color: string;
  initials: string;
};

export const UPI_APPS: UpiApp[] = [
  {
    id: "gpay",
    name: "Google Pay",
    androidPackage: "com.google.android.apps.nbu.paisa.user",
    iosPrefix: "gpay://upi/pay?",
    color: "#1a73e8",
    initials: "G",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    androidPackage: "com.phonepe.app",
    iosPrefix: "phonepe://pay?",
    color: "#5f259f",
    initials: "Pe",
  },
  {
    id: "paytm",
    name: "Paytm",
    androidPackage: "net.one97.paytm",
    iosPrefix: "paytmmp://pay?",
    color: "#00baf2",
    initials: "P",
  },
  {
    id: "bhim",
    name: "BHIM",
    androidPackage: "in.org.npci.upiapp",
    color: "#f37021",
    initials: "B",
  },
  {
    id: "cred",
    name: "CRED",
    androidPackage: "com.dreamplug.androidapp",
    color: "#111111",
    initials: "C",
  },
  {
    id: "amazonpay",
    name: "Amazon Pay",
    androidPackage: "in.amazon.mShop.android.shopping",
    color: "#ff9900",
    initials: "a",
  },
];

export function appsForPlatform(platform: Platform): UpiApp[] {
  if (platform === "android") return UPI_APPS.filter((a) => a.androidPackage);
  if (platform === "ios") return UPI_APPS.filter((a) => a.iosPrefix);
  return [];
}

/** Generic link — on Android this opens the system chooser listing every installed UPI app. */
export function genericUpiUrl(query: string) {
  return `upi://pay?${query}`;
}

export function appUpiUrl(app: UpiApp, query: string, platform: Platform) {
  if (platform === "android" && app.androidPackage) {
    // If the app is missing, Chrome falls back to its Play Store page.
    return `intent://pay?${query}#Intent;scheme=upi;package=${app.androidPackage};end`;
  }
  if (platform === "ios" && app.iosPrefix) return `${app.iosPrefix}${query}`;
  return genericUpiUrl(query);
}
