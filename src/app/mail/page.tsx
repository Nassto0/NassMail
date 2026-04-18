import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { MailClient } from "@/components/MailClient";
import { readMailParams, type MailUrlState } from "@/lib/mail-url";

function MailFallback() {
  return (
    <div className="h-screen grid place-items-center surface text-muted text-sm">
      Loading…
    </div>
  );
}

export default async function MailPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await requireUser();
  const sp = new URLSearchParams();
  const one = (k: string) => {
    const v = searchParams[k];
    return typeof v === "string" ? v : undefined;
  };
  if (one("folder")) sp.set("folder", one("folder")!);
  if (one("label")) sp.set("label", one("label")!);
  if (one("email")) sp.set("email", one("email")!);
  if (one("q")) sp.set("q", one("q")!);
  const initialUrl: MailUrlState = readMailParams(sp);

  return (
    <Suspense fallback={<MailFallback />}>
      <MailClient
        me={{
          id: user!.id,
          email: user!.email,
          username: user!.username,
          displayName: user!.displayName ?? user!.username,
          avatar: user!.avatar ?? null,
        }}
        initialUrl={initialUrl}
      />
    </Suspense>
  );
}
