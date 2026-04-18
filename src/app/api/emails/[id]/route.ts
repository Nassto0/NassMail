import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const labelSelect = {
  emailLabels: { select: { label: { select: { id: true, name: true, color: true } } } },
} as const;

const patchBodySchema = z.object({
  isStarred: z.boolean().optional(),
  isRead: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  folder: z.string().optional(),
  snoozeUntil: z.union([z.string(), z.null()]).optional(),
  labelIds: z.array(z.string().min(1)).optional(),
});

async function loadOwned(id: string, userId: string) {
  return prisma.email.findFirst({
    where: { id, OR: [{ senderId: userId }, { recipientId: userId }] },
  });
}

async function loadOwnedWithLabels(id: string, userId: string) {
  return prisma.email.findFirst({
    where: { id, OR: [{ senderId: userId }, { recipientId: userId }] },
    include: labelSelect,
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.email.findFirst({
    where: { id: params.id, OR: [{ senderId: user.id }, { recipientId: user.id }] },
    select: { id: true, isRead: true, recipientId: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!row.isRead && row.recipientId === user.id) {
    await prisma.email.update({ where: { id: row.id }, data: { isRead: true } });
  }
  const email = await loadOwnedWithLabels(params.id, user.id);
  return NextResponse.json({ email });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const emailRow = await loadOwned(params.id, user.id);
  if (!emailRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { labelIds, ...rest } = parsed.data;
  const data: Record<string, unknown> = {};
  if (typeof rest.isStarred === "boolean") data.isStarred = rest.isStarred;
  if (typeof rest.isRead === "boolean") data.isRead = rest.isRead;
  if (typeof rest.isImportant === "boolean") data.isImportant = rest.isImportant;
  if (typeof rest.folder === "string") data.folder = rest.folder;
  if (rest.snoozeUntil === null) data.snoozeUntil = null;
  else if (typeof rest.snoozeUntil === "string") data.snoozeUntil = new Date(rest.snoozeUntil);

  try {
    if (Object.keys(data).length > 0) {
      await prisma.email.update({ where: { id: emailRow.id }, data: data as any });
    }

    if (labelIds !== undefined) {
      const uniqueIds = [...new Set(labelIds)];
      const owned = await prisma.label.findMany({
        where: { userId: user.id, id: { in: uniqueIds } },
        select: { id: true },
      });
      const allow = new Set(owned.map((l) => l.id));
      const safe = uniqueIds.filter((id) => allow.has(id));

      /** Internal delivery creates two rows (SENT + INBOX). Link them with threadId and mirror labels only when every participant is the current user (e.g. send-to-self), never across another recipient's copy. */
      let emailIdsToRelabel = [emailRow.id];
      if (emailRow.threadId) {
        const cluster = await prisma.email.findMany({
          where: { threadId: emailRow.threadId },
          select: { id: true, senderId: true, recipientId: true },
        });
        const union = new Set<string>();
        for (const e of cluster) {
          if (e.senderId) union.add(e.senderId);
          if (e.recipientId) union.add(e.recipientId);
        }
        const soloUserThread = union.size === 1 && union.has(user.id);
        if (soloUserThread) {
          emailIdsToRelabel = cluster
            .filter((e) => e.senderId === user.id || e.recipientId === user.id)
            .map((e) => e.id);
        }
      }

      await prisma.$transaction(async (tx) => {
        for (const eid of emailIdsToRelabel) {
          await tx.emailLabel.deleteMany({ where: { emailId: eid } });
          if (safe.length > 0) {
            await tx.emailLabel.createMany({
              data: safe.map((labelId) => ({ emailId: eid, labelId })),
            });
          }
        }
      });
    }

    const out = await loadOwnedWithLabels(params.id, user.id);
    if (!out) {
      return NextResponse.json({ error: "Email missing after update" }, { status: 500 });
    }
    return NextResponse.json({ email: out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    console.error("[PATCH /api/emails/[id]]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = await loadOwned(params.id, user.id);
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (email.folder === "TRASH") {
    await prisma.email.delete({ where: { id: email.id } });
    return NextResponse.json({ ok: true, purged: true });
  }
  await prisma.email.update({ where: { id: email.id }, data: { folder: "TRASH" } });
  return NextResponse.json({ ok: true, purged: false });
}
