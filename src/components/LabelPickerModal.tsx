"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Tag, Check, Loader2, RefreshCw, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslate } from "./ThemeProvider";

type LabelRow = { id: string; name: string; color: string };

export function LabelPickerModal({
  emailId,
  onClose,
  onSaved,
}: {
  emailId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslate();
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const syncFromServer = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [labelsRes, mailRes] = await Promise.all([
        fetch("/api/labels", { cache: "no-store", credentials: "same-origin" }),
        fetch(`/api/emails/${encodeURIComponent(emailId)}`, { cache: "no-store", credentials: "same-origin" }),
      ]);
      const labelsData = await labelsRes.json().catch(() => ({}));
      const mailData = await mailRes.json().catch(() => ({}));

      if (!labelsRes.ok) {
        setErr(typeof labelsData.error === "string" ? labelsData.error : t("label.load_failed"));
        setLabels([]);
      } else {
        setLabels(Array.isArray(labelsData.labels) ? labelsData.labels : []);
      }

      if (!mailRes.ok) {
        setErr((prev) => prev ?? (typeof mailData.error === "string" ? mailData.error : t("label.load_failed")));
      } else if (mailData.email?.emailLabels && Array.isArray(mailData.email.emailLabels)) {
        setPicked(
          new Set(
            mailData.email.emailLabels.map((x: { label?: { id?: string } }) => x.label?.id).filter(Boolean) as string[],
          ),
        );
      } else {
        setPicked(new Set());
      }
    } catch {
      setErr(t("label.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [emailId, t]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  async function save() {
    if (!emailId.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(emailId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ labelIds: [...picked] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : t("label.save_failed"));
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setErr(t("label.save_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function createNewLabel() {
    const name = newName.trim();
    if (!name) return;
    setCreatingBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ name, color: newColor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : t("label.save_failed"));
        return;
      }
      const label: LabelRow = data.label;
      setLabels((prev) => [...prev, label].sort((a, b) => a.name.localeCompare(b.name)));
      setPicked((prev) => new Set(prev).add(label.id));
      setNewName("");
      setCreating(false);
    } catch {
      setErr(t("label.save_failed"));
    } finally {
      setCreatingBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[90] anim-fade" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-picker-title"
        className="fixed left-1/2 top-[min(20%,120px)] -translate-x-1/2 w-[min(400px,92vw)] surface rounded-2xl shadow-pop border border-token z-[95] overflow-hidden anim-up">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-token">
          <Tag className="w-4 h-4 text-brand shrink-0" />
          <span id="label-picker-title" className="font-semibold flex-1 min-w-0">
            {t("label.manage_title")}
          </span>
          <button
            type="button"
            onClick={() => void syncFromServer()}
            disabled={loading || saving}
            className="p-2 rounded-full hover:surface-hover disabled:opacity-40"
            title={t("label.reload_list")}
            aria-label={t("label.reload_list")}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:surface-hover" aria-label={t("top.close_menu")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[min(360px,50vh)] overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : labels.length === 0 ? (
            <p className="text-sm text-muted text-center py-8 px-2">{t("label.empty_hint")}</p>
          ) : (
            <ul className="space-y-1">
              {labels.map((l) => {
                const on = picked.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => toggle(l.id)}
                      className={cn(
                        "flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm text-start transition-colors",
                        on ? "bg-brand-soft text-brand" : "hover:surface-hover text-token",
                      )}>
                      <span
                        className="w-3 h-3 rounded-full shrink-0 ring-2 ring-[color:var(--border)]"
                        style={{ background: l.color }}
                      />
                      <span className="flex-1 truncate font-medium">{l.name}</span>
                      {on && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {err && <p className="text-sm text-danger mt-2 px-1">{err}</p>}

          {creating ? (
            <div className="mt-3 p-2 rounded-xl surface-soft border border-token anim-up">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer"
                  aria-label="Color"
                />
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void createNewLabel(); if (e.key === "Escape") setCreating(false); }}
                  placeholder="New label name"
                  className="flex-1 bg-transparent text-sm outline-none border-b border-transparent focus:border-token"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2 text-xs">
                <button type="button" onClick={() => setCreating(false)} className="text-muted hover:text-token">
                  {t("side.cancel")}
                </button>
                <button
                  type="button"
                  disabled={creatingBusy || !newName.trim()}
                  onClick={() => void createNewLabel()}
                  className="text-brand font-medium disabled:opacity-50">
                  {creatingBusy ? "…" : t("side.create")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-2 flex items-center gap-2 w-full rounded-xl px-3 py-2 text-sm text-brand hover:surface-hover">
              <Plus className="w-4 h-4" /> New label
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-token surface-soft">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-full hover:surface-hover">
            {t("side.cancel")}
          </button>
          <button
            type="button"
            disabled={saving || loading || !emailId.trim()}
            onClick={() => void save()}
            className="btn-brand px-5 py-2 text-sm rounded-full font-medium disabled:opacity-50">
            {saving ? t("label.saving") : t("label.save")}
          </button>
        </div>
      </div>
    </>
  );
}
