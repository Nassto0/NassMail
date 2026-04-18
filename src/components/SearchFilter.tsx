"use client";
import { SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { useTranslate } from "./ThemeProvider";

export type SearchFilters = {
  from: string; to: string; subject: string; hasWords: string;
  dateFrom: string; dateTo: string;
};
export const emptyFilters: SearchFilters = { from: "", to: "", subject: "", hasWords: "", dateFrom: "", dateTo: "" };

export function SearchFilter({
  filters, setFilters, onApply,
}: {
  filters: SearchFilters; setFilters: (f: SearchFilters) => void; onApply: () => void;
}) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const activeCount = Object.values(filters).filter(Boolean).length;

  function patch(k: keyof SearchFilters, v: string) { setFilters({ ...filters, [k]: v }); }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="p-2 rounded-full hover:surface-hover relative" title={t("search.options")}>
        <SlidersHorizontal className="w-4 h-4 text-muted" />
        {activeCount > 0 && <span className="absolute -top-0.5 -end-0.5 w-4 h-4 text-[10px] bg-brand text-white rounded-full grid place-items-center">{activeCount}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30 anim-fade" onClick={() => setOpen(false)} />
          <div className="fixed top-16 left-1/2 -translate-x-1/2 w-[min(640px,92vw)] surface rounded-2xl shadow-pop border border-token z-40 p-5 anim-up">
            <div className="flex items-center">
              <div className="font-semibold">{t("search.advanced")}</div>
              <button type="button" onClick={() => setOpen(false)} className="ms-auto p-1 rounded-full hover:surface-hover">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Field label={t("search.from")}><Input value={filters.from} onChange={(v) => patch("from", v)} placeholder="sender@domain.com" /></Field>
              <Field label={t("search.to")}><Input value={filters.to} onChange={(v) => patch("to", v)} placeholder="recipient@domain.com" /></Field>
              <Field label={t("search.subject")}><Input value={filters.subject} onChange={(v) => patch("subject", v)} placeholder="Subject contains…" /></Field>
              <Field label={t("search.has_words")}><Input value={filters.hasWords} onChange={(v) => patch("hasWords", v)} placeholder="invoice, paid, urgent…" /></Field>
              <Field label={t("search.date_from")}><Input type="date" value={filters.dateFrom} onChange={(v) => patch("dateFrom", v)} /></Field>
              <Field label={t("search.date_to")}><Input type="date" value={filters.dateTo} onChange={(v) => patch("dateTo", v)} /></Field>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => { setFilters(emptyFilters); onApply(); }}
                className="px-4 py-2 text-sm rounded-full hover:surface-hover">{t("search.clear")}</button>
              <button type="button" onClick={() => { onApply(); setOpen(false); }}
                className="btn-brand px-5 py-2 text-sm rounded-full font-medium">{t("search.search")}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
function Input(props: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      value={props.value} onChange={(e) => props.onChange(e.target.value)}
      type={props.type ?? "text"} placeholder={props.placeholder}
      className="w-full rounded-xl border border-token px-3 py-2 surface-soft outline-none"
    />
  );
}
