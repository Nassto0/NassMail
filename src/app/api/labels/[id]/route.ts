import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const label = await prisma.label.findFirst({ where: { id: params.id, userId: user.id } });
  if (!label) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof body.name === "string") data.name = body.name.slice(0, 40);
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) data.color = body.color;
  const updated = await prisma.label.update({ where: { id: label.id }, data });
  return NextResponse.json({ label: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const label = await prisma.label.findFirst({ where: { id: params.id, userId: user.id } });
  if (!label) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.label.delete({ where: { id: label.id } });
  return NextResponse.json({ ok: true });
}
