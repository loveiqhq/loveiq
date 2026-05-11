import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { hasRole } from "@/lib/admin/roles";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { supabaseFetch } from "@/lib/admin/supabase";
import { logAdminAction } from "@/lib/admin/audit";
import logger from "@/lib/logger";

const editSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-notes-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { noteId } = await params;
  const noteIdNum = parseInt(noteId, 10);
  if (isNaN(noteIdNum) || noteIdNum < 1) {
    return NextResponse.json({ error: "Invalid note ID." }, { status: 400 });
  }

  // Verify ownership
  const checkRes = await supabaseFetch(`/rest/v1/admin_note?id=eq.${noteIdNum}&select=admin_email`);
  if (!checkRes.ok) {
    return NextResponse.json({ error: "Unable to verify note." }, { status: 500 });
  }
  const notes = (await checkRes.json()) as Array<{ admin_email: string }>;
  if (notes.length === 0) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  // notes.length checked > 0 above; [0] is defined.
  if (notes[0]!.admin_email !== admin.email) {
    return NextResponse.json({ error: "You can only edit your own notes." }, { status: 403 });
  }

  const parsed = editSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_note?id=eq.${noteIdNum}`, {
      method: "PATCH",
      body: JSON.stringify({
        content: parsed.data.content,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Note update failed");
      return NextResponse.json({ error: "Unable to update note." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Note update error");
    return NextResponse.json({ error: "Unable to update note." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const csrfValid = await verifyCsrfToken(request);
  if (!csrfValid) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const admin = await verifyAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!hasRole(admin.role, "editor")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-notes-write",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  const { id, noteId } = await params;
  const noteIdNum = parseInt(noteId, 10);
  if (isNaN(noteIdNum) || noteIdNum < 1) {
    return NextResponse.json({ error: "Invalid note ID." }, { status: 400 });
  }

  // Only author or admin can delete
  const checkRes = await supabaseFetch(`/rest/v1/admin_note?id=eq.${noteIdNum}&select=admin_email`);
  if (!checkRes.ok) {
    return NextResponse.json({ error: "Unable to verify note." }, { status: 500 });
  }
  const notes = (await checkRes.json()) as Array<{ admin_email: string }>;
  if (notes.length === 0) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  if (notes[0]!.admin_email !== admin.email && !hasRole(admin.role, "admin")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const res = await supabaseFetch(`/rest/v1/admin_note?id=eq.${noteIdNum}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      logger.error({ status: res.status }, "Note deletion failed");
      return NextResponse.json({ error: "Unable to delete note." }, { status: 500 });
    }

    logAdminAction({
      admin_email: admin.email,
      action: "delete_note",
      resource_type: "submission",
      resource_id: id,
      metadata: { note_id: noteIdNum },
      ip,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Note deletion error");
    return NextResponse.json({ error: "Unable to delete note." }, { status: 500 });
  }
}
