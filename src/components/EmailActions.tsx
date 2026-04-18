"use client";
import { MoreHorizontal, MailOpen, MailX, OctagonAlert, Inbox, Clock, Tag, Printer, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslate } from "./ThemeProvider";

export type EmailActionsProps = {
  isRead: boolean;
  isImportant: boolean;
  folder: string;
  onMarkRead: (read: boolean) => void;
  onMarkImportant: (important: boolean) => void;
  onMoveToSpam: () => void;
  onMoveToInbox: () => void;
  onSnooze: (until: Date) => void;
  onPrint: () => void;
  onLabel: () => void;
};

export function EmailActions(props: EmailActionsProps) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function snoozePreset(hours: number) {
    const d = new Date(Date.now() + hours * 3600 * 1000);
    props.onSnooze(d);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="p-2 rounded-full hover:surface-hover" title={t("read.more_actions")}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-64 surface rounded-2xl shadow-pop border border-token z-20 py-2 anim-scale">
          <Item icon={props.isRead ? MailX : MailOpen} label={props.isRead ? t("read.mark_unread") : t("read.mark_read")}
            onClick={() => { props.onMarkRead(!props.isRead); setOpen(false); }} />
          <Item icon={AlertCircle} label={props.isImportant ? t("read.mark_not_important") : t("read.mark_important")}
            onClick={() => { props.onMarkImportant(!props.isImportant); setOpen(false); }} />
          <Divider />
          <div className="px-3 pt-1 pb-0.5 text-[11px] uppercase tracking-wider text-subtle">{t("read.snooze_heading")}</div>
          <Item icon={Clock} label={t("read.snooze_3h")} onClick={() => snoozePreset(3)} />
          <Item icon={Clock} label={t("read.snooze_tmrw")} onClick={() => snoozePreset(24)} />
          <Item icon={Clock} label={t("read.snooze_week")} onClick={() => snoozePreset(24 * 7)} />
          <Divider />
          {props.folder !== "SPAM"
            ? <Item icon={OctagonAlert} label={t("read.move_spam")} onClick={() => { props.onMoveToSpam(); setOpen(false); }} danger />
            : <Item icon={Inbox} label={t("read.not_spam")} onClick={() => { props.onMoveToInbox(); setOpen(false); }} />}
          <Item icon={Tag} label={t("read.add_label")} onClick={() => { props.onLabel(); setOpen(false); }} />
          <Item icon={Printer} label={t("read.print")} onClick={() => { props.onPrint(); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function Item({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2 text-sm hover:surface-hover ${danger ? "text-danger" : "text-token"}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
function Divider() { return <div className="my-1 h-px bg-[color:var(--border)]" />; }
