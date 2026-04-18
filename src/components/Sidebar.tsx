"use client";
import {
  Inbox, Star, Clock, Send, FileEdit, Tag, ChevronDown, ChevronUp,
  AlertCircle, CalendarClock, Mail as MailIcon, OctagonAlert, Trash2,
  Plus, Pencil, Palette,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslate } from "./ThemeProvider";

export type FolderKey =
  | "INBOX" | "STARRED" | "SNOOZED" | "SENT" | "DRAFTS"
  | "IMPORTANT" | "SCHEDULED" | "ALL" | "SPAM" | "TRASH";

type LabelRow = { id: string; name: string; color: string };

const PRIMARY: { key: FolderKey; tkey: string; icon: typeof Inbox }[] = [
  { key: "INBOX",    tkey: "folder.inbox",    icon: Inbox },
  { key: "STARRED",  tkey: "folder.starred",  icon: Star },
  { key: "SNOOZED",  tkey: "folder.snoozed",  icon: Clock },
  { key: "SENT",     tkey: "folder.sent",     icon: Send },
  { key: "DRAFTS",   tkey: "folder.drafts",   icon: FileEdit },
];
const SECONDARY: { key: FolderKey; tkey: string; icon: typeof Inbox }[] = [
  { key: "IMPORTANT", tkey: "folder.important", icon: AlertCircle },
  { key: "SCHEDULED", tkey: "folder.scheduled", icon: CalendarClock },
  { key: "ALL",       tkey: "folder.all",       icon: MailIcon },
  { key: "SPAM",      tkey: "folder.spam",      icon: OctagonAlert },
  { key: "TRASH",     tkey: "folder.trash",     icon: Trash2 },
];

export function Sidebar({
  folder, setFolder, unread, onCompose, onOpenSettings,
  onSelectLabel, selectedLabelId,
  mobileNavOpen,
  onMobileNav,
  onLabelsDirty,
}: {
  folder: FolderKey;
  setFolder: (f: FolderKey) => void;
  unread: number;
  onCompose: () => void;
  onOpenSettings: () => void;
  onSelectLabel: (id: string | null) => void;
  selectedLabelId: string | null;
  mobileNavOpen: boolean;
  onMobileNav: () => void;
  /** Called after labels are created or deleted (parent can refresh mail list). */
  onLabelsDirty?: () => void;
}) {
  const t = useTranslate();
  const [showMore, setShowMore] = useState(false);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  async function loadLabels() {
    const res = await fetch("/api/labels", { cache: "no-store", credentials: "same-origin" });
    if (res.ok) setLabels((await res.json()).labels);
  }
  useEffect(() => { loadLabels(); }, []);

  async function createLabel() {
    if (!newName.trim()) return;
    const res = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    if (res.ok) {
      setNewName("");
      setCreating(false);
      await loadLabels();
      onLabelsDirty?.();
    }
  }
  async function deleteLabel(id: string) {
    await fetch(`/api/labels/${id}`, { method: "DELETE", credentials: "same-origin", cache: "no-store" });
    if (selectedLabelId === id) onSelectLabel(null);
    await loadLabels();
    onLabelsDirty?.();
  }

  function nav() {
    onMobileNav();
  }

  return (
    <aside
      className={cn(
        "px-3 py-4 border-e border-token surface flex flex-col overflow-y-auto shrink-0",
        "md:relative md:w-60",
        "max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:z-50 max-md:w-[min(280px,88vw)] max-md:shadow-pop",
        mobileNavOpen
          ? "max-md:translate-x-0"
          : "max-md:pointer-events-none max-md:-translate-x-full max-md:rtl:translate-x-full",
      )}>
      <button
        type="button"
        onClick={() => { onCompose(); nav(); }}
        className="btn-brand flex items-center gap-2 w-full rounded-2xl px-4 py-3 shadow-soft font-medium hover-lift anim-scale">
        <Pencil className="w-4 h-4" /> {t("side.compose")}
      </button>

      <nav className="mt-4 space-y-0.5">
        {PRIMARY.map((f) => (
          <FolderButton
            key={f.key}
            item={f}
            label={t(f.tkey)}
            active={folder === f.key && !selectedLabelId}
            badge={f.key === "INBOX" && unread > 0 ? unread : undefined}
            onClick={() => { setFolder(f.key); onSelectLabel(null); nav(); }}
          />
        ))}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm text-muted hover:surface-hover">
          {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showMore ? t("side.less") : t("side.more")}
        </button>

        {showMore && (
          <div className="anim-fade space-y-0.5">
            {SECONDARY.map((f) => (
              <FolderButton
                key={f.key}
                item={f}
                label={t(f.tkey)}
                active={folder === f.key && !selectedLabelId}
                onClick={() => { setFolder(f.key); onSelectLabel(null); nav(); }}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Labels */}
      <div className="mt-5 px-3 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-subtle uppercase">{t("side.labels")}</span>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="p-1 rounded-full hover:surface-hover"
          title={t("side.create_label")}>
          <Plus className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>

      {creating && (
        <div className="mt-2 mx-2 p-2 rounded-xl surface shadow-soft border border-token anim-up">
          <div className="flex items-center gap-2">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer" />
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createLabel()}
              placeholder={t("side.label_name")}
              className="flex-1 text-sm outline-none border-b border-transparent focus:border-token" />
          </div>
          <div className="flex justify-end gap-2 mt-2 text-xs">
            <button type="button" onClick={() => setCreating(false)} className="text-muted hover:text-token">{t("side.cancel")}</button>
            <button type="button" onClick={createLabel} className="text-brand font-medium">{t("side.create")}</button>
          </div>
        </div>
      )}

      <div className="mt-1 space-y-0.5 flex-1 overflow-y-auto">
        {labels.map((l) => (
          <div key={l.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => { onSelectLabel(l.id); nav(); }}
              className={cn(
                "flex items-center gap-3 flex-1 min-w-0 px-3 py-2 rounded-full text-sm",
                selectedLabelId === l.id ? "bg-brand-soft text-brand font-semibold" : "hover:surface-hover",
              )}>
              <Tag className="w-4 h-4 shrink-0" style={{ color: l.color }} />
              <span className="truncate">{l.name}</span>
            </button>
            <button
              type="button"
              onClick={() => deleteLabel(l.id)}
              className="opacity-0 group-hover:opacity-100 p-1 text-subtle hover:text-danger">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {labels.length === 0 && !creating && (
          <div className="px-3 py-2 text-xs text-subtle">{t("side.no_labels")}</div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-token">
        <button
          type="button"
          onClick={() => { onOpenSettings(); nav(); }}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm text-muted hover:surface-hover">
          <Palette className="w-4 h-4" /> {t("side.themes_settings")}
        </button>
      </div>
    </aside>
  );
}

function FolderButton({
  item, label, active, onClick, badge,
}: {
  item: { key: FolderKey; icon: typeof Inbox };
  label: string;
  active: boolean; onClick: () => void; badge?: number;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm hover-lift",
        active ? "bg-brand-soft text-brand font-semibold" : "hover:surface-hover text-token",
      )}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge !== undefined && <span className="ms-auto text-xs font-medium">{badge}</span>}
    </button>
  );
}
