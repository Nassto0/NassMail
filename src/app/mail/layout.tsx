import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ReactNode } from "react";

export default async function MailLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
