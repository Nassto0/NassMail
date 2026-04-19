"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Mail, Search, RefreshCw, LogOut, X, AlertCircle, ArrowLeft, Reply, Star,
  Trash2, Settings as SettingsIcon, Clock, AlertTriangle, Inbox as InboxIcon,
  CalendarClock, Menu, Tag,
} from "lucide-react";
import { cn, colorFor, formatDate, initials } from "@/lib/utils";
import { buildMailParams, mailParamsSignature, readMailParams, type MailUrlState } from "@/lib/mail-url";
import { usePrefs, useTranslate } from "./ThemeProvider";
import { Sidebar, FolderKey } from "./Sidebar";
import { SettingsPanel } from "./SettingsPanel";
import { SearchFilter, SearchFilters, emptyFilters } from "./SearchFilter";
import { EmailActions } from "./EmailActions";
import { ContextMenuLayer, type ContextMenuItem } from "./ContextMenu";
import { LabelPickerModal } from "./LabelPickerModal";

type Me = { id: string; email: string; username: string; displayName: string; avatar: string | null };

type EmailRow = {
  id: string; subject: string;
  fromAddress: string; fromName: string | null;
  toAddress: string; toName: string | null;
  isRead: boolean; isStarred: boolean; isImportant: boolean;
  folder: string; createdAt: string; bodyText: string;
  snoozeUntil: string | null; scheduledFor: string | null;
  emailLabels?: { label: { id: string; name: string; color: string } }[];
};
type EmailFull = EmailRow & { bodyHtml: string };

const FOLDER_TITLE_KEY: Record<FolderKey, string> = {
  INBOX: "folder.inbox",
  STARRED: "folder.starred",
  SNOOZED: "folder.snoozed",
  SENT: "folder.sent",
  DRAFTS: "folder.drafts",
  IMPORTANT: "folder.important",
  SCHEDULED: "folder.scheduled",
  ALL: "folder.all",
  SPAM: "folder.spam",
  TRASH: "folder.trash",
};

function toIso(d: unknown): string {
  if (d == null) return "";
  if (typeof d === "string") return d;
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function normalizeEmailFull(raw: Record<string, unknown> | null | undefined): EmailFull | null {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
  const labels = Array.isArray(raw.emailLabels) ? raw.emailLabels : [];
  return {
    id: raw.id,
    subject: typeof raw.subject === "string" ? raw.subject : "",
    fromAddress: String(raw.fromAddress ?? ""),
    fromName: (raw.fromName as string | null) ?? null,
    toAddress: String(raw.toAddress ?? ""),
    toName: (raw.toName as string | null) ?? null,
    isRead: !!raw.isRead,
    isStarred: !!raw.isStarred,
    isImportant: !!raw.isImportant,
    folder: String(raw.folder ?? "INBOX"),
    createdAt: toIso(raw.createdAt),
    bodyText: typeof raw.bodyText === "string" ? raw.bodyText : "",
    bodyHtml: typeof raw.bodyHtml === "string" ? raw.bodyHtml : "",
    snoozeUntil: raw.snoozeUntil ? toIso(raw.snoozeUntil) : null,
    scheduledFor: raw.scheduledFor ? toIso(raw.scheduledFor) : null,
    emailLabels: labels as EmailRow["emailLabels"],
  };
}

export function MailClient({ me: initialMe, initialUrl }: { me: Me; initialUrl?: MailUrlState }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const syncingFromUrl = useRef(false);

  const init = initialUrl ?? { folder: "INBOX" as FolderKey, labelId: null, emailId: null, q: "" };
  const { prefs } = usePrefs();
  const t = useTranslate();
  const [me, setMe] = useState<Me>(initialMe);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [folder, setFolder] = useState<FolderKey>(init.folder);
  const [labelId, setLabelId] = useState<string | null>(init.labelId);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(init.emailId);
  const [selected, setSelected] = useState<EmailFull | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInit, setComposeInit] = useState<{ to?: string; subject?: string; body?: string }>({});
  const [q, setQ] = useState(init.q);
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [labelTargetId, setLabelTargetId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [navLabels, setNavLabels] = useState<{ id: string; name: string }[]>([]);

  const loadNavLabels = useCallback(async () => {
    const res = await fetch("/api/labels", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as { labels?: { id: string; name: string }[] };
    setNavLabels(Array.isArray(data.labels) ? data.labels : []);
  }, []);

  useEffect(() => {
    void loadNavLabels();
  }, [loadNavLabels]);

  useEffect(() => {
    const s = readMailParams(searchParams);
    syncingFromUrl.current = true;
    setFolder(s.labelId ? "ALL" : s.folder);
    setLabelId(s.labelId);
    setSelectedId(s.emailId);
    setQ(s.q);
  }, [searchParams]);

  useEffect(() => {
    if (syncingFromUrl.current) {
      syncingFromUrl.current = false;
      return;
    }
    const next = buildMailParams({ folder, labelId, emailId: selectedId, q }).toString();
    const cur = mailParamsSignature(searchParams);
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [folder, labelId, selectedId, q, pathname, router, searchParams]);

  const refresh = useCallback(async (opts?: { pullExternal?: boolean }) => {
    setLoading(true);
    /** Pull any new external mail from the IMAP provider first, so clicking Refresh on INBOX surfaces replies that Cloudflare Email Routing forwarded to our Gmail. Non-fatal — list still loads even if the poller is misconfigured. */
    if (opts?.pullExternal) {
      try {
        const pullRes = await fetch("/api/inbound/refresh", { method: "POST", credentials: "same-origin", cache: "no-store" });
        if (!pullRes.ok) {
          const body = (await pullRes.json().catch(() => ({}))) as { error?: string; hint?: string };
          const msg = body.hint || body.error || t("top.refresh_mail_failed");
          setToast(msg.length > 220 ? `${msg.slice(0, 217)}…` : msg);
          window.setTimeout(() => setToast(null), 8000);
        }
      } catch {}
    }
    const params = new URLSearchParams({ folder });
    if (q.trim()) params.set("q", q.trim());
    if (labelId) params.set("label", labelId);
    (Object.entries(filters) as [keyof SearchFilters, string][]).forEach(([k, v]) => { if (v) params.set(k, v); });
    const res = await fetch(`/api/emails?${params}`, { cache: "no-store", credentials: "same-origin" });
    const data = await res.json();
    setEmails(data.emails || []);
    setLoading(false);
    void loadNavLabels();
  }, [folder, q, labelId, filters, loadNavLabels, t]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => { if (folder === "INBOX") refresh(); }, 30000);
    return () => clearInterval(id);
  }, [folder, refresh]);

  useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    (async () => {
      const res = await fetch(`/api/emails/${selectedId}`, { cache: "no-store", credentials: "same-origin" });
      const data = await res.json();
      const full = normalizeEmailFull(data.email);
      if (full) {
        setSelected(full);
        setEmails((rows) => rows.map((r) => (r.id === full.id ? { ...r, isRead: true } : r)));
      }
    })();
  }, [selectedId]);

  const sorted = useMemo(() => {
    if (folder !== "INBOX") return emails;
    const copy = [...emails];
    if (prefs.inboxType === "important") copy.sort((a, b) => (Number(b.isImportant) - Number(a.isImportant)) || +new Date(b.createdAt) - +new Date(a.createdAt));
    if (prefs.inboxType === "unread")    copy.sort((a, b) => (Number(!a.isRead) - Number(!b.isRead)) * -1 || +new Date(b.createdAt) - +new Date(a.createdAt));
    if (prefs.inboxType === "starred")   copy.sort((a, b) => (Number(b.isStarred) - Number(a.isStarred)) || +new Date(b.createdAt) - +new Date(a.createdAt));
    return copy;
  }, [emails, folder, prefs.inboxType]);

  const counts = useMemo(() => ({ unread: emails.filter((e) => !e.isRead && folder === "INBOX").length }), [emails, folder]);

  async function toggleStar(row: EmailRow) {
    const next = !row.isStarred;
    setEmails((rows) => rows.map((r) => (r.id === row.id ? { ...r, isStarred: next } : r)));
    await fetch(`/api/emails/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ isStarred: next }),
    });
  }
  async function trash(id: string) {
    await fetch(`/api/emails/${id}`, { method: "DELETE", credentials: "same-origin", cache: "no-store" });
    setEmails((rows) => rows.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const data = (await res.json().catch(() => ({}))) as { email?: Record<string, unknown> };
    await refresh();
    if (selectedId === id) {
      const full = normalizeEmailFull(data.email);
      if (full) setSelected(full);
      else setSelected((s) => (s ? { ...s, ...body } as EmailFull : s));
    }
  }

  async function afterLabelsSaved(emailId: string) {
    await refresh();
    if (selectedId === emailId) {
      const res = await fetch(`/api/emails/${emailId}`, { cache: "no-store", credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      const full = normalizeEmailFull(data.email);
      if (full) setSelected(full);
    }
    setToast(t("label.saved_ok"));
    window.setTimeout(() => setToast(null), 2800);
  }

  function copyMessageLink(emailId: string) {
    const p = buildMailParams({ folder, labelId, emailId, q });
    const url = `${window.location.origin}${pathname}?${p}`;
    void navigator.clipboard.writeText(url);
  }

  function openReplyFromRow(row: EmailRow) {
    const isSent = folder === "SENT" || folder === "DRAFTS" || folder === "SCHEDULED";
    const toAddr = isSent ? row.toAddress : row.fromAddress;
    const toNm = isSent ? (row.toName ?? row.toAddress) : (row.fromName ?? row.fromAddress);
    setComposeInit({
      to: toAddr,
      subject: row.subject.startsWith("Re:") ? row.subject : `Re: ${row.subject}`,
      body: `\n\n----- On ${new Date(row.createdAt).toLocaleString()}, ${toNm} wrote -----\n${row.bodyText}`,
    });
    setComposeOpen(true);
  }

  function openRowContextMenu(e: React.MouseEvent, row: EmailRow) {
    e.preventDefault();
    e.stopPropagation();
    const canReply = folder !== "DRAFTS";
    const items: ContextMenuItem[] = [
      { key: "open", label: t("ctx.open"), onClick: () => setSelectedId(row.id) },
      { key: "reply", label: t("ctx.reply"), onClick: () => openReplyFromRow(row), disabled: !canReply },
      { key: "star", label: row.isStarred ? t("ctx.unstar") : t("ctx.star"), onClick: () => { void toggleStar(row); } },
      { key: "read", label: row.isRead ? t("ctx.mark_unread") : t("ctx.mark_read"), onClick: () => { void patch(row.id, { isRead: !row.isRead }); }, separatorBefore: true },
      { key: "labels", label: t("ctx.labels"), onClick: () => setLabelTargetId(row.id) },
      { key: "link", label: t("ctx.copy_link"), onClick: () => copyMessageLink(row.id) },
      { key: "del", label: t("ctx.delete"), onClick: () => { void trash(row.id); }, danger: true, separatorBefore: true },
    ];
    setCtx({ x: e.clientX, y: e.clientY, items });
  }

  function openListBackgroundContextMenu(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button, a, [role='menuitem']")) return;
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { key: "inbox", label: t("ctx.inbox_home"), onClick: () => { setFolder("INBOX"); setLabelId(null); setSelectedId(null); } },
        { key: "compose", label: t("ctx.compose"), onClick: () => { setComposeInit({}); setComposeOpen(true); } },
        { key: "refresh", label: t("ctx.refresh"), onClick: () => void refresh({ pullExternal: true }), separatorBefore: true },
      ],
    });
  }

  function openReaderContextMenu(e: React.MouseEvent, email: EmailFull) {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { key: "reply", label: t("ctx.reply"), onClick: () => reply(email) },
      { key: "star", label: email.isStarred ? t("ctx.unstar") : t("ctx.star"), onClick: () => { void toggleStar(email as EmailRow); } },
      { key: "read", label: email.isRead ? t("ctx.mark_unread") : t("ctx.mark_read"), onClick: () => { void patch(email.id, { isRead: !email.isRead }); }, separatorBefore: true },
      { key: "labels", label: t("ctx.labels"), onClick: () => setLabelTargetId(email.id) },
      { key: "link", label: t("ctx.copy_link"), onClick: () => copyMessageLink(email.id) },
      { key: "del", label: t("ctx.delete"), onClick: () => { void trash(email.id); }, danger: true, separatorBefore: true },
    ];
    setCtx({ x: e.clientX, y: e.clientY, items });
  }

  function reply(e: EmailFull) {
    setComposeInit({
      to: e.fromAddress,
      subject: e.subject.startsWith("Re:") ? e.subject : `Re: ${e.subject}`,
      body: `\n\n----- On ${new Date(e.createdAt).toLocaleString()}, ${e.fromName ?? e.fromAddress} wrote -----\n${e.bodyText}`,
    });
    setComposeOpen(true);
  }

  const splitRight = prefs.readingPane === "right";
  const splitBelow = prefs.readingPane === "below";
  const noSplit = prefs.readingPane === "no-split";

  return (
    <div className="h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <button
        type="button"
        aria-label={t("top.close_menu")}
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/30 transition-opacity",
          mobileNavOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setMobileNavOpen(false)}
      />
      {/* Top bar */}
      <header className="flex items-center gap-2 md:gap-3 px-3 md:px-4 h-14 surface border-b border-token">
        <button
          type="button"
          className="md:hidden p-2 rounded-full hover:surface-hover shrink-0"
          aria-label={t("top.menu")}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((o) => !o)}>
          <Menu className="w-5 h-5 text-token" />
        </button>
        <Link
          href="/mail"
          onClick={() => setMobileNavOpen(false)}
          className="flex items-center gap-2 min-w-0 md:w-60 shrink-0 rounded-xl hover:surface-hover px-1.5 py-1 -ms-0.5 transition-colors outline-none"
          aria-label={t("app.brand_aria")}>
          <div className="w-8 h-8 rounded-xl grid place-items-center text-white shadow-pop shrink-0"
               style={{ background: "linear-gradient(135deg, var(--brand), var(--accent))" }}>
            <Mail className="w-4 h-4" />
          </div>
          <span className="font-semibold tracking-tight text-lg truncate">NassMail</span>
        </Link>
        <div className="flex-1 max-w-2xl min-w-0">
          <div className="search-pill flex items-center gap-2 surface-soft rounded-full px-3 md:px-4 py-2 border border-token transition-shadow">
            <Search className="w-4 h-4 text-subtle shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void refresh({ pullExternal: true }); }}
              placeholder={t("top.search")}
              className="flex-1 bg-transparent outline-none text-sm min-w-0 border-0 focus:ring-0 focus-visible:ring-0 focus-visible:shadow-none" />
            {q && (
              <button type="button" className="shrink-0" onClick={() => { setQ(""); setTimeout(refresh, 0); }}>
                <X className="w-4 h-4 text-subtle" />
              </button>
            )}
            <SearchFilter filters={filters} setFilters={setFilters} onApply={() => void refresh({ pullExternal: true })} />
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-2 ms-auto shrink-0">
          <button
            type="button"
            onClick={() => void refresh({ pullExternal: true })}
            className="p-2 rounded-full hover:surface-hover"
            title={t("top.refresh")}>
            <RefreshCw className={cn("w-4 h-4 text-muted", loading && "animate-spin")} />
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)} className="p-2 rounded-full hover:surface-hover" title={t("top.settings")}>
            <SettingsIcon className="w-4 h-4 text-muted" />
          </button>
          <UserBadge me={me} />
        </div>
      </header>

      <div className="flex-1 flex min-h-0 min-w-0">
        <Sidebar
          folder={folder}
          setFolder={(f) => { setFolder(f); setSelectedId(null); }}
          unread={counts.unread}
          onCompose={() => { setComposeInit({}); setComposeOpen(true); }}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectLabel={(id) => {
            setSelectedId(null);
            if (id) {
              setFolder("ALL");
              setLabelId(id);
            } else {
              setLabelId(null);
            }
          }}
          selectedLabelId={labelId}
          mobileNavOpen={mobileNavOpen}
          onMobileNav={() => setMobileNavOpen(false)}
          onLabelsDirty={() => {
            void refresh();
            void loadNavLabels();
          }}
        />

        <main className={cn("flex-1 flex min-w-0 overflow-hidden", splitBelow && "flex-col")}>
          {/* List */}
          <section
            className={cn(
              "surface overflow-y-auto border-token min-w-0",
              splitRight && selected && "w-[420px] hidden md:block border-e",
              splitBelow && "border-b",
              splitBelow && selected && "h-1/2",
              noSplit && selected && "hidden",
              !selected && "flex-1",
            )}
            onContextMenu={openListBackgroundContextMenu}>
            {loading && emails.length === 0 ? (
              <SkeletonList />
            ) : sorted.length === 0 ? (
              <EmptyState
                folder={folder}
                labelId={labelId}
                labelName={labelId ? navLabels.find((l) => l.id === labelId)?.name : undefined}
                hasSearch={!!q.trim() || Object.values(filters).some(Boolean)}
              />
            ) : (
              <ul className="divide-y divide-[color:var(--border)]">
                {sorted.map((row, i) => (
                  <EmailRowItem
                    key={row.id} row={row} index={i}
                    folder={folder}
                    selected={selectedId === row.id}
                    onOpen={() => setSelectedId(row.id)}
                    onToggleStar={() => toggleStar(row)}
                    onContextMenu={(e) => openRowContextMenu(e, row)}
                  />
                ))}
              </ul>
            )}
          </section>

          {selected && (
            <section className={cn(
              "flex-1 overflow-y-auto surface min-w-0",
              splitRight && "anim-fade",
              splitBelow && "h-1/2",
            )}>
              <ReaderPane
                email={selected}
                onBack={() => setSelectedId(null)}
                onTrash={() => trash(selected.id)}
                onReply={() => reply(selected)}
                onToggleStar={() => toggleStar(selected as any)}
                onContextMenu={(e) => openReaderContextMenu(e, selected)}
                onActions={{
                  markRead: (v: boolean) => patch(selected.id, { isRead: v }),
                  markImportant: (v: boolean) => patch(selected.id, { isImportant: v }),
                  moveToSpam: () => patch(selected.id, { folder: "SPAM" }),
                  moveToInbox: () => patch(selected.id, { folder: "INBOX" }),
                  snooze: (until: Date) => patch(selected.id, { snoozeUntil: until.toISOString() }),
                  print: () => window.print(),
                  label: () => setLabelTargetId(selected.id),
                }}
              />
            </section>
          )}
        </main>
      </div>

      {composeOpen && (
        <ComposeModal me={me} init={composeInit} onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); refresh(); }} />
      )}
      <SettingsPanel
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        me={me}
        onUpdateMe={(m) => setMe((cur) => ({ ...cur, ...m }))}
      />
      <ContextMenuLayer state={ctx} onClose={() => setCtx(null)} />
      {labelTargetId ? (
        <LabelPickerModal
          key={labelTargetId}
          emailId={labelTargetId}
          onClose={() => setLabelTargetId(null)}
          onSaved={() => void afterLabelsSaved(labelTargetId)}
        />
      ) : null}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] px-4 py-2 rounded-full shadow-pop border border-token surface text-sm font-medium anim-up">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ─── pieces ─── */

function EmailRowItem({
  row, selected, folder, onOpen, onToggleStar, index, onContextMenu,
}: {
  row: EmailRow; selected: boolean; folder: FolderKey; index: number;
  onOpen: () => void; onToggleStar: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const t = useTranslate();
  const isSent = folder === "SENT" || folder === "DRAFTS" || folder === "SCHEDULED";
  const name = isSent ? (row.toName ?? row.toAddress) : (row.fromName ?? row.fromAddress);
  const snoozed = row.snoozeUntil && new Date(row.snoozeUntil) > new Date();
  const scheduled = row.scheduledFor && new Date(row.scheduledFor) > new Date();
  return (
    <li
      className={cn("anim-row flex items-stretch", selected && "bg-brand-soft")}
      style={{ animationDelay: `${Math.min(index * 15, 200)}ms` }}
      onContextMenu={onContextMenu}>
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-start px-4 row flex hover:surface-hover transition-colors">
        <Avatar name={name} />
        <div className="flex-1 min-w-0 ps-3">
          <div className="flex items-center gap-2">
            <span className={cn("truncate", row.isRead ? "email-row-read" : "email-row-unread")}>
              {name}
            </span>
            {row.isImportant && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            <span className="ms-auto text-xs text-subtle shrink-0">{formatDate(row.createdAt)}</span>
          </div>
          <div className={cn("truncate text-sm", row.isRead ? "text-muted" : "text-token font-medium")}>
            {row.subject || t("read.no_subject")}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="truncate text-xs text-subtle flex-1">
              {row.bodyText?.slice(0, 140) || ""}
            </span>
            {row.emailLabels?.map((el) => (
              <span key={el.label.id}
                className="text-[10px] px-1.5 py-0.5 rounded-full border"
                style={{ color: el.label.color, borderColor: el.label.color + "66" }}>
                {el.label.name}
              </span>
            ))}
            {snoozed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />{t("badge.snoozed")}
              </span>
            )}
            {scheduled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 inline-flex items-center gap-1">
                <CalendarClock className="w-3 h-3" />{t("badge.scheduled")}
              </span>
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleStar}
        className="shrink-0 px-3 self-start hover:surface-hover"
        style={{ paddingTop: "var(--row-py)" }}
        aria-label={row.isStarred ? t("read.unstar") : t("read.star")}>
        <Star className={cn("w-4 h-4", row.isStarred ? "fill-amber-400 text-amber-400" : "text-[color:var(--text-subtle)]")} />
      </button>
    </li>
  );
}

function UserBadge({ me }: { me: Me }) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full hover-lift">
        {me.avatar
          ? <img src={me.avatar} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-[color:var(--brand-soft)]" />
          : <div className={cn("w-9 h-9 rounded-full grid place-items-center text-white font-semibold", colorFor(me.email))}>
              {initials(me.displayName || me.username)}
            </div>}
      </button>
      {open && (
        <div className="absolute end-0 mt-2 w-64 surface rounded-2xl shadow-pop p-4 z-20 anim-scale border border-token">
          <div className="flex items-center gap-3">
            {me.avatar
              ? <img src={me.avatar} className="w-10 h-10 rounded-full object-cover" alt="" />
              : <div className={cn("w-10 h-10 rounded-full grid place-items-center text-white font-semibold", colorFor(me.email))}>
                  {initials(me.displayName || me.username)}
                </div>}
            <div className="min-w-0">
              <div className="font-medium truncate">{me.displayName}</div>
              <div className="text-xs text-muted truncate">{me.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-4 w-full flex items-center gap-2 justify-center surface-soft hover:surface-hover rounded-xl py-2 text-sm">
            <LogOut className="w-4 h-4" /> {t("auth.signout")}
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) return <img src={url} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />;
  return (
    <div className={cn("w-9 h-9 rounded-full grid place-items-center text-white text-sm font-semibold shrink-0", colorFor(name))}>
      {initials(name)}
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="divide-y divide-[color:var(--border)]">
      {Array.from({ length: 7 }).map((_, i) => (
        <li key={i} className="px-4 row flex">
          <div className="w-9 h-9 rounded-full skeleton shrink-0" />
          <div className="flex-1 ps-3 space-y-2">
            <div className="h-3 w-40 rounded skeleton" />
            <div className="h-3 w-72 rounded skeleton" />
            <div className="h-2 w-96 rounded skeleton" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  folder,
  labelId,
  labelName,
  hasSearch,
}: {
  folder: FolderKey;
  labelId: string | null;
  labelName?: string;
  hasSearch: boolean;
}) {
  const t = useTranslate();
  const name = t(FOLDER_TITLE_KEY[folder]);
  const labelDisplay = labelName?.trim() || labelId || "";

  if (labelId) {
    return (
      <div className="h-full grid place-items-center text-center p-10 anim-fade">
        <div>
          <div className="w-16 h-16 rounded-2xl surface-soft grid place-items-center mx-auto mb-3">
            <Tag className="w-7 h-7 text-muted" />
          </div>
          <div className="font-semibold">{t("folder.empty_label_title", { label: labelDisplay })}</div>
          <div className="text-sm text-muted mt-1 max-w-sm mx-auto">{t("folder.empty_label_body")}</div>
        </div>
      </div>
    );
  }

  if (hasSearch) {
    return (
      <div className="h-full grid place-items-center text-center p-10 anim-fade">
        <div>
          <div className="w-16 h-16 rounded-2xl surface-soft grid place-items-center mx-auto mb-3">
            <Search className="w-7 h-7 text-muted" />
          </div>
          <div className="font-semibold">{t("folder.empty_search_title")}</div>
          <div className="text-sm text-muted mt-1 max-w-sm mx-auto">{t("folder.empty_search_body")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid place-items-center text-center p-10 anim-fade">
      <div>
        <div className="w-16 h-16 rounded-2xl surface-soft grid place-items-center mx-auto mb-3">
          <InboxIcon className="w-7 h-7 text-muted" />
        </div>
        <div className="font-semibold">{t("folder.empty_title", { folder: name })}</div>
        <div className="text-sm text-muted mt-1">{t("folder.empty_body")}</div>
      </div>
    </div>
  );
}

function ReaderPane({
  email, onBack, onTrash, onReply, onToggleStar, onActions, onContextMenu,
}: {
  email: EmailFull;
  onBack: () => void; onTrash: () => void; onReply: () => void; onToggleStar: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onActions: {
    markRead: (v: boolean) => void; markImportant: (v: boolean) => void;
    moveToSpam: () => void; moveToInbox: () => void;
    snooze: (until: Date) => void; print: () => void; label: () => void;
  };
}) {
  const t = useTranslate();
  const fromName = email.fromName ?? email.fromAddress;
  return (
    <div className="max-w-3xl mx-auto px-6 py-5 anim-up" onContextMenu={onContextMenu}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button type="button" onClick={onBack} className="md:hidden p-2 rounded-full hover:surface-hover" aria-label={t("top.close_menu")}>
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
        </button>
        <button type="button" onClick={onReply} className="flex items-center gap-1 px-3 py-1.5 rounded-full surface-soft hover:surface-hover text-sm">
          <Reply className="w-4 h-4 rtl:scale-x-[-1]" /> {t("read.reply")}
        </button>
        <button type="button" onClick={onTrash} className="flex items-center gap-1 px-3 py-1.5 rounded-full surface-soft hover:surface-hover text-sm">
          <Trash2 className="w-4 h-4" /> {t("read.delete")}
        </button>
        <button type="button" onClick={onToggleStar} className="flex items-center gap-1 px-3 py-1.5 rounded-full surface-soft hover:surface-hover text-sm">
          <Star className={cn("w-4 h-4", email.isStarred && "fill-amber-400 text-amber-400")} />
          {email.isStarred ? t("read.unstar") : t("read.star")}
        </button>
        <div className="ms-auto">
          <EmailActions
            isRead={email.isRead}
            isImportant={email.isImportant}
            folder={email.folder}
            onMarkRead={onActions.markRead}
            onMarkImportant={onActions.markImportant}
            onMoveToSpam={onActions.moveToSpam}
            onMoveToInbox={onActions.moveToInbox}
            onSnooze={onActions.snooze}
            onPrint={onActions.print}
            onLabel={onActions.label}
          />
        </div>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{email.subject || t("read.no_subject")}</h1>
      <div className="flex items-center gap-3 mt-4">
        <Avatar name={fromName} />
        <div className="min-w-0">
          <div className="text-sm">
            <span className="font-medium">{fromName}</span>{" "}
            <span className="text-muted">&lt;{email.fromAddress}&gt;</span>
          </div>
          <div className="text-xs text-muted">{t("read.to")} {email.toAddress} · {new Date(email.createdAt).toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-6">
        {email.bodyHtml
          ? <div className="letter" dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
          : <div className="letter letter--plain">{email.bodyText}</div>}
      </div>
    </div>
  );
}

function ComposeModal({ me, init, onClose, onSent }: {
  me: Me; init: { to?: string; subject?: string; body?: string };
  onClose: () => void; onSent: () => void;
}) {
  const t = useTranslate();
  const [to, setTo] = useState(init.to ?? "");
  const [subject, setSubject] = useState(init.subject ?? "");
  const [body, setBody] = useState(init.body ?? "");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<string>("");

  async function send(mode: "send" | "draft" | "schedule") {
    setSending(true); setErr(null); setHint(null);
    const payload: any = { to, subject, text: body, html: "" };
    if (mode === "draft") payload.draft = true;
    if (mode === "schedule") payload.scheduledFor = new Date(scheduleAt).toISOString();
    const res = await fetch("/api/emails", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) { setErr(data.error || t("compose.failed")); if (data.hint) setHint(data.hint); return; }
    onSent();
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-20 grid place-items-end md:place-items-center p-0 md:p-6 anim-fade">
      <div className="w-full md:max-w-2xl surface rounded-t-3xl md:rounded-3xl shadow-pop overflow-hidden flex flex-col max-h-[90vh] anim-up">
        <div className="flex items-center px-5 py-3 text-white"
             style={{ background: "linear-gradient(135deg, var(--brand-strong), var(--brand))" }}>
          <span className="font-medium">{t("compose.new")}</span>
          <button type="button" onClick={onClose} className="ms-auto p-1 rounded-full hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-2 border-b border-token text-sm">
          <div className="flex items-center gap-2 py-1">
            <span className="text-muted w-16 shrink-0">{t("compose.from")}</span>
            <span>{me.email}</span>
          </div>
          <div className="flex items-center gap-2 py-1 border-t border-token">
            <span className="text-muted w-16 shrink-0">{t("compose.to")}</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com"
              className="flex-1 outline-none py-1 min-w-0" />
          </div>
          <div className="flex items-center gap-2 py-1 border-t border-token">
            <span className="text-muted w-16 shrink-0">{t("compose.subject")}</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("compose.subject")}
              className="flex-1 outline-none py-1 min-w-0" />
          </div>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("compose.write")}
          className="flex-1 px-5 py-3 outline-none text-sm resize-none min-h-[240px] bg-transparent" />
        {err && (
          <div className="px-5 py-2 text-sm text-danger surface-soft border-t border-token flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <div><div>{err}</div>{hint && <div className="text-xs opacity-80 mt-1">{hint}</div>}</div>
          </div>
        )}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-token flex-wrap">
          <button type="button" disabled={sending || !to} onClick={() => send("send")}
            className="btn-brand disabled:opacity-50 rounded-full px-5 py-2 text-sm font-medium">
            {sending ? t("compose.sending") : t("compose.send")}
          </button>
          <button type="button" disabled={sending} onClick={() => send("draft")}
            className="text-sm text-muted hover:text-token">{t("compose.save_draft")}</button>
          <div className="ms-auto flex items-center gap-2">
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
              className="text-xs rounded-xl border border-token px-2 py-1 surface-soft" />
            <button type="button" disabled={sending || !to || !scheduleAt} onClick={() => send("schedule")}
              className="text-xs rounded-full px-3 py-1 border border-token hover:surface-hover disabled:opacity-50">
              {t("compose.schedule")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
