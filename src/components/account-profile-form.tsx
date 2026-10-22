"use client";
import { useState } from "react";

type Values = { name: string; phone: string; addressLine1: string; addressLine2: string; city: string; postalCode: string; country: string };
const FIELDS: { name: keyof Values; label: string; placeholder: string; autoComplete: string; half?: boolean; type?: string }[] = [
  { name: "name", label: "Full name", placeholder: "Your full name", autoComplete: "name", half: true },
  { name: "phone", label: "Phone number", placeholder: "+20 100 000 0000", autoComplete: "tel", half: true, type: "tel" },
  { name: "addressLine1", label: "Street address", placeholder: "Building and street", autoComplete: "address-line1" },
  { name: "addressLine2", label: "Apartment / unit (optional)", placeholder: "Apartment, floor, unit", autoComplete: "address-line2" },
  { name: "city", label: "City", placeholder: "City", autoComplete: "address-level2", half: true },
  { name: "postalCode", label: "Postal code", placeholder: "Postal code", autoComplete: "postal-code", half: true },
  { name: "country", label: "Country", placeholder: "Country", autoComplete: "country-name" },
];
export function AccountProfileForm({ initialValues }: { initialValues: Values }) {
  const [values, setValues] = useState<Values>(initialValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setMessage(null); setErrors({});
    try {
      const response = await fetch("/api/account/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        if (payload?.details) setErrors(payload.details as Record<string, string[]>);
        setMessage({ type: "error", text: payload?.error ?? "We couldn't save your profile. Please try again." }); return;
      }
      if (payload?.data?.user) setValues((old) => ({ ...old, ...payload.data.user }));
      setMessage({ type: "success", text: "Your profile has been saved." });
    } catch { setMessage({ type: "error", text: "Network error. Please try again." }); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="glass-card p-6 sm:p-8">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">Personal details</h2><p className="mt-1 text-sm text-muted">Your email is verified by Google and cannot be edited here.</p></div><span className="badge-neutral w-fit">Private profile</span></div>
    {message && <p role={message.type === "error" ? "alert" : "status"} className={"mt-5 rounded-lg border px-4 py-3 text-sm " + (message.type === "error" ? "border-primary/30 bg-primary/10 text-primary" : "border-success/30 bg-success/10 text-success")}>{message.text}</p>}
    <div className="mt-6 grid gap-5 sm:grid-cols-2">{FIELDS.map((f) => <div key={f.name} className={f.half ? "" : "sm:col-span-2"}>
      <label htmlFor={f.name} className="mb-1.5 block text-sm font-medium">{f.label}</label>
      <input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} maxLength={f.name === "phone" ? 32 : 256} value={values[f.name]} onChange={(e) => setValues((old) => ({ ...old, [f.name]: e.target.value }))} aria-invalid={Boolean(errors[f.name])} className={"input-dark " + (errors[f.name] ? "!border-primary/60" : "")} />
      {errors[f.name] && <p role="alert" className="mt-1.5 text-xs text-primary">{errors[f.name][0]}</p>}
    </div>)}</div>
    <button type="submit" disabled={saving} className="btn-primary mt-8 w-full py-3">{saving ? "Saving profile…" : "Save profile"}</button>
  </form>;
}
