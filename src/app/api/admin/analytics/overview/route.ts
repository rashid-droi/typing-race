import { requireAdmin, AdminAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const sessions = await prisma.trainingSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const wpms = sessions.map((s) => s.finalWpm).filter((w) => w > 0);
    const avg = wpms.length ? wpms.reduce((a, b) => a + b, 0) / wpms.length : 0;
    const sorted = [...wpms].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
    const teamA = sessions.filter((s) => s.teamId === 0);
    const teamB = sessions.filter((s) => s.teamId === 1);
    const avgA = teamA.length
      ? teamA.reduce((a, s) => a + s.finalWpm, 0) / teamA.length
      : 0;
    const avgB = teamB.length
      ? teamB.reduce((a, s) => a + s.finalWpm, 0) / teamB.length
      : 0;
    const maxLen = Math.max(
      0,
      ...sessions.map((s) => (Array.isArray(s.wpmHistory) ? s.wpmHistory.length : 0))
    );
    const blended: (number | null)[] = [];
    for (let i = 0; i < Math.min(maxLen, 60); i++) {
      const vals: number[] = [];
      for (const s of sessions) {
        const h = s.wpmHistory as number[];
        if (Array.isArray(h) && i < h.length) vals.push(Number(h[i]));
      }
      blended.push(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
    }
    return Response.json({
      session_count: sessions.length,
      avg_final_wpm: Math.round(avg * 100) / 100,
      median_final_wpm: Math.round(median * 100) / 100,
      team_a_sessions: teamA.length,
      team_b_sessions: teamB.length,
      team_a_avg_wpm: Math.round(avgA * 100) / 100,
      team_b_avg_wpm: Math.round(avgB * 100) / 100,
      wpm_history_blended: blended.map((v) => (v == null ? null : Math.round(v * 100) / 100)),
      recent_peak_wpm: wpms.length ? Math.round(Math.max(...wpms) * 100) / 100 : 0,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return Response.json({ detail: e.message }, { status: 401 });
    }
    throw e;
  }
}
