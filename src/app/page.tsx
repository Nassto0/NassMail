import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

export default async function RootRedirect() {
  const user = await requireUser();
  redirect(user ? "/mail" : "/home");
}
