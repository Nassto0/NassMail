import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const labels = await prisma.label.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ labels });
}

const createSchema = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const label = await prisma.label.create({
      data: { userId: user.id, name: parsed.data.name, color: parsed.data.color || "#6366f1" },
    });
    return NextResponse.json({ label });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Label name already exists" }, { status: 409 });
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
