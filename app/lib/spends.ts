import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  CATEGORIES_COLLECTION,
  db,
  SPENDS_COLLECTION,
} from "@/app/Services/firebase";
import type { UpiPayload } from "./upi";

export type Category = {
  id: string;
  name: string;
  emoji: string;
  /** true for the built-in categories that live in code, not Firestore */
  builtIn?: boolean;
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "Food & Dining", emoji: "🍔", builtIn: true },
  { id: "groceries", name: "Groceries", emoji: "🛒", builtIn: true },
  { id: "transport", name: "Transport", emoji: "🚕", builtIn: true },
  { id: "fuel", name: "Fuel", emoji: "⛽", builtIn: true },
  { id: "shopping", name: "Shopping", emoji: "🛍️", builtIn: true },
  { id: "bills", name: "Bills & Utilities", emoji: "💡", builtIn: true },
  { id: "health", name: "Health", emoji: "💊", builtIn: true },
  { id: "entertainment", name: "Entertainment", emoji: "🎬", builtIn: true },
  { id: "other", name: "Other", emoji: "📦", builtIn: true },
];

export type Spend = {
  id: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string;
  comment: string;
  date: Date;
  payeeVpa: string | null;
  payeeName: string | null;
  source: "upi-qr" | "upi-manual" | "manual";
};

export type NewSpend = {
  amount: number;
  category: Category;
  /** yyyy-mm-dd from the date input */
  dateKey: string;
  comment: string;
  upi: UpiPayload | null;
};

export async function saveSpend(spend: NewSpend) {
  // Combine the chosen day with the current time so same-day spends keep their order.
  const now = new Date();
  const [y, m, d] = spend.dateKey.split("-").map(Number);
  const date = new Date(
    y,
    m - 1,
    d,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );

  const ref = await addDoc(collection(db, SPENDS_COLLECTION), {
    amount: spend.amount,
    currency: "INR",
    categoryId: spend.category.id,
    categoryName: spend.category.name,
    categoryEmoji: spend.category.emoji,
    comment: spend.comment.trim(),
    date: Timestamp.fromDate(date),
    dateKey: spend.dateKey,
    source: !spend.upi ? "manual" : spend.upi.origin === "qr" ? "upi-qr" : "upi-manual",
    payeeVpa: spend.upi?.pa ?? null,
    payeeName: spend.upi?.pn ?? null,
    payeeMobile: spend.upi?.mobile ?? null,
    upiQr: spend.upi?.origin === "qr" ? spend.upi.raw : null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveCategory(name: string, emoji: string) {
  const ref = await addDoc(collection(db, CATEGORIES_COLLECTION), {
    name: name.trim(),
    emoji,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name: name.trim(), emoji } satisfies Category;
}

export function subscribeCategories(
  onChange: (categories: Category[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(db, CATEGORIES_COLLECTION), orderBy("createdAt", "asc")),
    (snap) => {
      const custom = snap.docs.map((doc) => ({
        id: doc.id,
        name: String(doc.get("name") ?? ""),
        emoji: String(doc.get("emoji") ?? "🏷️"),
      }));
      onChange(custom.filter((c) => c.name));
    },
    onError,
  );
}

/** Live list of spends on or after `since`, newest first. */
export function subscribeSpends(
  since: Date,
  onChange: (spends: Spend[]) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(db, SPENDS_COLLECTION),
      where("date", ">=", Timestamp.fromDate(since)),
      orderBy("date", "desc"),
    ),
    (snap) => {
      onChange(
        snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            amount: Number(data.amount) || 0,
            categoryId: data.categoryId ?? "other",
            categoryName: data.categoryName ?? "Other",
            categoryEmoji: data.categoryEmoji ?? "📦",
            comment: data.comment ?? "",
            date: (data.date as Timestamp | undefined)?.toDate() ?? new Date(),
            payeeVpa: data.payeeVpa ?? null,
            payeeName: data.payeeName ?? null,
            source: data.source === "upi-qr" || data.source === "upi-manual" ? data.source : "manual",
          };
        }),
      );
    },
    onError,
  );
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatINR(amount: number) {
  return inr.format(amount);
}

export function describeFirebaseError(error: unknown) {
  const code = (error as { code?: string })?.code ?? "";
  if (code === "permission-denied")
    return "Firestore denied access. Check your Firestore security rules.";
  if (code === "unavailable")
    return "Can't reach Firebase. Check your internet connection.";
  if (code === "failed-precondition")
    return "Firestore isn't ready. Make sure a Firestore database is created for this project.";
  return (error as Error)?.message || "Something went wrong.";
}

export function deleteSpend(id: string) {
  return deleteDoc(doc(db, SPENDS_COLLECTION, id));
}
