import { requireAdmin, AdminAuthError, addAuditEvent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
    const rows = await prisma.trainingSession.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return Response.json(
      rows.map((r) => ({
        id: r.id,
        ts: r.createdAt.getTime() / 1000,
        room_id: r.roomId,
        user_label: r.userLabel,
        team_id: r.teamId,
        final_wpm: r.finalWpm,
        accuracy: r.accuracy,
        progress: r.progress,
        duration_s: r.durationS,
        wpm_history: r.wpmHistory,
        replay: r.replay,
        managed_event_id: r.managedEventId,
      }))
    );
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const row = await prisma.trainingSession.create({
      data: {
        roomId: body.room_id ?? null,
        userLabel: body.user_label ?? admin.email,
        teamId: body.team_id ?? null,
        finalWpm: Number(body.final_wpm ?? 0),
        accuracy: Number(body.accuracy ?? 0),
        progress: Number(body.progress ?? 0),
        durationS: Number(body.duration_s ?? 0),
        wpmHistory: body.wpm_history ?? [],
        replay: body.replay ?? [],
        managedEventId: body.managed_event_id ?? null,
      },
    });
    await addAuditEvent({
      companyId: admin.companyId,
      type: "training.session_ingested",
      actor: row.userLabel ?? "unknown",
      meta: { session_id: row.id, room_id: row.roomId },
    });
    return Response.json({
      id: row.id,
      ts: row.createdAt.getTime() / 1000,
      room_id: row.roomId,
      user_label: row.userLabel,
      team_id: row.teamId,
      final_wpm: row.finalWpm,
      accuracy: row.accuracy,
      progress: row.progress,
      duration_s: row.durationS,
      wpm_history: row.wpmHistory,
      replay: row.replay,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
