"use client";
import { X, Upload, Check, Trash2 } from "lucide-react";
import { useState, useRef } from "react";
import { THEMES, Density, ReadingPane, InboxType, ThemeKey } from "@/lib/themes";
import { LANGS, Lang } from "@/lib/i18n";
import { usePrefs, useTranslate } from "./ThemeProvider";
import { cn, colorFor, initials } from "@/lib/utils";

type Me = { id: string; email: string; username: string; displayName: string; avatar: string | null };

export function SettingsPanel({
  open, onClose, me, onUpdateMe,
}: {
  open: boolean; onClose: () => void; me: Me; onUpdateMe: (m: Partial<Me>) => void;
}) {
  const { prefs, setPrefs } = usePrefs();
  const t = useTranslate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState(me.displayName);
  const [savingName, setSavingName] = useState(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 600_000) { alert("Please choose an image under ~600KB."); return; }
    const data = await fileToDataUrl(file);
    const res = await fetch("/api/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: data }),
    });
    if (res.ok) onUpdateMe({ avatar: data });
  }
  async function clearAvatar() {
    await fetch("/api/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: null }),
    });
    onUpdateMe({ avatar: null });
  }
  async function saveName() {
    if (!displayName.trim() || displayName === me.displayName) return;
    setSavingName(true);
    const res = await fetch("/api/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    setSavingName(false);
    if (res.ok) onUpdateMe({ displayName });
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30 anim-fade" onClick={onClose} />
      <aside className="fixed top-0 end-0 bottom-0 w-full sm:w-[420px] surface z-40 shadow-pop flex flex-col anim-right">
        <header className="flex items-center gap-3 px-5 h-14 border-b border-token">
          <span className="text-lg font-semibold">{t("set.quick")}</span>
          <button type="button" onClick={onClose} className="ms-auto p-2 rounded-full hover:surface-hover" aria-label={t("top.close_menu")}>
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5 space-y-7">
          {/* Profile */}
          <section>
            <SectionTitle>{t("set.profile")}</SectionTitle>
            <div className="flex items-center gap-4 mt-3">
              <div className="relative">
                {me.avatar ? (
                  <img src={me.avatar} alt="" className="w-16 h-16 rounded-full object-cover ring-2 ring-brand/30" />
                ) : (
                  <div className={cn("w-16 h-16 rounded-full grid place-items-center text-white font-semibold text-xl", colorFor(me.email))}>
                    {initials(me.displayName || me.username)}
                  </div>
                )}
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -end-1 bg-brand text-white p-1.5 rounded-full shadow-soft">
                  <Upload className="w-3 h-3" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-muted">{t("set.signed_as")}</div>
                <div className="font-medium truncate">{me.email}</div>
                {me.avatar && (
                  <button type="button" onClick={clearAvatar} className="mt-1 text-xs text-danger flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> {t("set.remove_photo")}
                  </button>
                )}
              </div>
            </div>
            <label className="block mt-4">
              <span className="text-xs font-medium text-muted">{t("auth.display_name")}</span>
              <div className="mt-1 flex gap-2">
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 rounded-xl border border-token px-3 py-2 surface-soft" />
                <button type="button" onClick={saveName} disabled={savingName || displayName === me.displayName || !displayName.trim()}
                  className="btn-brand rounded-xl px-4 text-sm disabled:opacity-50">
                  {t("set.save")}
                </button>
              </div>
            </label>
          </section>

          {/* Language */}
          <section>
            <SectionTitle>{t("set.language")}</SectionTitle>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {LANGS.map((L) => (
                <button
                  key={L.key}
                  type="button"
                  onClick={() => setPrefs({ lang: L.key as Lang })}
                  className={cn(
                    "rounded-xl border py-2.5 text-sm hover-lift",
                    (prefs.lang ?? "en") === L.key ? "border-brand bg-brand-soft text-brand font-medium" : "border-token hover:surface-hover",
                  )}>
                  <span className="block font-medium">{L.nativeLabel}</span>
                  <span className="block text-xs text-muted">{L.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Density */}
          <section>
            <SectionTitle>{t("set.density")}</SectionTitle>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {([
                ["comfortable", "set.comfortable"],
                ["default", "set.default"],
                ["compact", "set.compact"],
              ] as [Density, string][]).map(([d, key]) => (
                <button key={d} type="button" onClick={() => setPrefs({ density: d })}
                  className={cn(
                    "rounded-xl border py-2 text-sm hover-lift",
                    prefs.density === d ? "border-brand bg-brand-soft text-brand font-medium" : "border-token hover:surface-hover",
                  )}>
                  {t(key)}
                </button>
              ))}
            </div>
          </section>

          {/* Theme */}
          <section>
            <SectionTitle>{t("set.theme")}</SectionTitle>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {THEMES.map((theme) => (
                <button
                  key={theme.key}
                  type="button"
                  onClick={() => setPrefs({ theme: theme.key as ThemeKey })}
                  className={cn(
                    "group relative rounded-xl overflow-hidden ring-1 ring-token hover-lift h-20",
                    prefs.theme === theme.key && "ring-2 ring-brand",
                  )}>
                  <div className={cn("absolute inset-0 bg-gradient-to-br", theme.preview)} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/30 backdrop-blur-sm text-white text-xs font-medium py-1.5 px-2 flex items-center justify-between">
                    <span>{theme.label}</span>
                    {prefs.theme === theme.key && <Check className="w-3.5 h-3.5" />}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Inbox type */}
          <section>
            <SectionTitle>{t("set.inbox_type")}</SectionTitle>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {([
                ["default", "set.inbox_default"],
                ["important", "set.inbox_important"],
                ["unread", "set.inbox_unread"],
                ["starred", "set.inbox_starred"],
              ] as [InboxType, string][]).map(([key, labelKey]) => (
                <button key={key} type="button" onClick={() => setPrefs({ inboxType: key })}
                  className={cn(
                    "rounded-xl border py-2 text-sm hover-lift",
                    prefs.inboxType === key ? "border-brand bg-brand-soft text-brand font-medium" : "border-token hover:surface-hover",
                  )}>
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </section>

          {/* Reading pane */}
          <section>
            <SectionTitle>{t("set.reading_pane")}</SectionTitle>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {([
                ["no-split", "set.pane_no_split"],
                ["right", "set.pane_right"],
                ["below", "set.pane_below"],
              ] as [ReadingPane, string][]).map(([key, labelKey]) => (
                <button key={key} type="button" onClick={() => setPrefs({ readingPane: key })}
                  className={cn(
                    "rounded-xl border py-2 text-sm hover-lift",
                    prefs.readingPane === key ? "border-brand bg-brand-soft text-brand font-medium" : "border-token hover:surface-hover",
                  )}>
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </section>

          {/* Email threading */}
          <section>
            <SectionTitle>{t("set.threading")}</SectionTitle>
            <label className="flex items-center justify-between gap-3 mt-2 p-3 rounded-xl border border-token">
              <div className="min-w-0">
                <div className="text-sm font-medium">{t("set.conv_view")}</div>
                <div className="text-xs text-muted">{t("set.conv_view_sub")}</div>
              </div>
              <Toggle on={prefs.conversationView} onChange={(v) => setPrefs({ conversationView: v })} />
            </label>
          </section>
        </div>
      </aside>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold tracking-wider uppercase text-subtle">{children}</div>;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "w-10 h-6 rounded-full relative transition-colors shrink-0",
        on ? "bg-brand" : "bg-[color:var(--border)]",
      )}>
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-[inset-inline-start]",
          on ? "start-[18px]" : "start-0.5",
        )}
      />
    </button>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
