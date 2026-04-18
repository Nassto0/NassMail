import type { FolderKey } from "@/components/Sidebar"; // type-only

const KEYS = new Set<string>([
  "INBOX", "STARRED", "SNOOZED", "SENT", "DRAFTS",
  "IMPORTANT", "SCHEDULED", "ALL", "SPAM", "TRASH",
]);

export function parseFolderParam(v: string | null): FolderKey {
  const u = (v || "INBOX").toUpperCase();
  return KEYS.has(u) ? (u as FolderKey) : "INBOX";
}

export type MailUrlState = {
  folder: FolderKey;
  labelId: string | null;
  emailId: string | null;
  q: string;
};

export function readMailParams(sp: URLSearchParams): MailUrlState {
  return {
    folder: parseFolderParam(sp.get("folder")),
    labelId: sp.get("label")?.trim() || null,
    emailId: sp.get("email")?.trim() || null,
    q: sp.get("q")?.trim() ?? "",
  };
}

export function buildMailParams(state: MailUrlState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("folder", state.folder);
  if (state.labelId) p.set("label", state.labelId);
  if (state.emailId) p.set("email", state.emailId);
  if (state.q.trim()) p.set("q", state.q.trim());
  return p;
}

/** Canonical query string for comparison (order-independent). */
export function mailParamsSignature(sp: URLSearchParams): string {
  return buildMailParams(readMailParams(sp)).toString();
}
