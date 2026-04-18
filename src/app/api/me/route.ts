import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let prefs: any = {};
  try { prefs = JSON.parse(user.preferences || "{}"); } catch {}
  return NextResponse.json({
    user: {
      id: user.id, email: user.email, username: user.username,
      displayName: user.displayName, avatar: user.avatar, preferences: prefs,
    },
  });
}

const patchSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  avatar: z.string().nullable().optional(), // data URL or null to clear
  preferences: z.record(z.any()).optional(),
});

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const data: any = {};
  if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
  if (parsed.data.avatar !== undefined) {
    if (parsed.data.avatar && parsed.data.avatar.length > 800_000) {
      return NextResponse.json({ error: "Avatar too large (max ~600KB)" }, { status: 413 });
    }
    data.avatar = parsed.data.avatar;
  }
  if (parsed.data.preferences) {
    let cur: any = {}; try { cur = JSON.parse(user.preferences || "{}"); } catch {}
    data.preferences = JSON.stringify({ ...cur, ...parsed.data.preferences });
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  let prefs: any = {}; try { prefs = JSON.parse(updated.preferences || "{}"); } catch {}
  return NextResponse.json({
    user: {
      id: updated.id, email: updated.email, username: updated.username,
      displayName: updated.displayName, avatar: updated.avatar, preferences: prefs,
    },
  });
}
