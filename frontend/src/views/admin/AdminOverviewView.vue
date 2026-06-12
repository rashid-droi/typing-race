<script setup lang="ts">
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { jsPDF } from "jspdf";
import { computed, onMounted, ref } from "vue";
import { Bar, Line } from "vue-chartjs";
import {
  fetchAnalyticsOverview,
  fetchEvents,
  fetchTrainingSessions,
  type AdminEventRow,
  type AnalyticsOverview,
  type TrainingSessionRow,
} from "../../lib/adminApi";
import { useAdminAuthStore } from "../../stores/adminAuth";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const admin = useAdminAuthStore();
const overview = ref<AnalyticsOverview | null>(null);
const sessions = ref<TrainingSessionRow[]>([]);
const events = ref<AdminEventRow[]>([]);
const loadError = ref<string | null>(null);

const slateAxis = {
  ticks: { color: "#94a3b8" },
  grid: { color: "#1e293b" },
};

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: "#cbd5e1" } },
  },
  scales: {
    x: slateAxis,
    y: slateAxis,
  },
};

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: slateAxis,
    y: slateAxis,
  },
};

async function load() {
  const t = admin.token;
  if (!t) return;
  loadError.value = null;
  try {
    const [o, s, e] = await Promise.all([
      fetchAnalyticsOverview(t),
      fetchTrainingSessions(t, 30),
      fetchEvents(t, 40),
    ]);
    overview.value = o;
    sessions.value = s;
    events.value = e;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : "Failed to load";
  }
}

onMounted(load);

const lineChartData = computed(() => {
  const raw = overview.value?.wpm_history_blended ?? [];
  let last = 0;
  const filled =
    raw.length > 0
      ? raw.map((v) => {
          if (v != null && !Number.isNaN(Number(v))) {
            last = Number(v);
            return last;
          }
          return last;
        })
      : [0];
  const labels = filled.map((_, i) => `t${i + 1}`);
  return {
    labels,
    datasets: [
      {
        label: "Blended WPM (ingested sessions)",
        data: filled,
        borderColor: "rgb(139, 92, 246)",
        backgroundColor: "rgba(139, 92, 246, 0.12)",
        tension: 0.35,
        fill: true,
      },
    ],
  };
});

const barChartData = computed(() => ({
  labels: ["Team A", "Team B"],
  datasets: [
    {
      label: "Avg final WPM",
      data: [overview.value?.team_a_avg_wpm ?? 0, overview.value?.team_b_avg_wpm ?? 0],
      backgroundColor: ["rgba(56, 189, 248, 0.7)", "rgba(244, 114, 182, 0.7)"],
    },
  ],
}));

function exportPdf() {
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(16);
  doc.text("Typing Race — Admin report", 14, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Company: ${admin.companySlug} · Generated ${new Date().toISOString()}`, 14, y);
  y += 8;
  doc.setTextColor(30, 30, 30);
  const o = overview.value;
  if (o) {
    doc.text(`Sessions recorded: ${o.session_count}`, 14, y);
    y += 6;
    doc.text(`Avg final WPM: ${o.avg_final_wpm} · Median: ${o.median_final_wpm} · Peak: ${o.recent_peak_wpm}`, 14, y);
    y += 6;
    doc.text(
      `Team A: ${o.team_a_sessions} sessions, avg WPM ${o.team_a_avg_wpm} | Team B: ${o.team_b_sessions} sessions, avg WPM ${o.team_b_avg_wpm}`,
      14,
      y
    );
    y += 10;
  }
  doc.setFontSize(11);
  doc.text("Recent training sessions", 14, y);
  y += 6;
  doc.setFontSize(9);
  for (const s of sessions.value.slice(0, 12)) {
    if (y > 270) {
      doc.addPage();
      y = 16;
    }
    const line = `${s.user_label ?? "?"} · room ${s.room_id ?? "-"} · ${s.final_wpm} wpm · acc ${(s.accuracy * 100).toFixed(0)}%`;
    doc.text(line, 14, y);
    y += 5;
  }
  y += 4;
  doc.setFontSize(11);
  doc.text("Recent audit events", 14, y);
  y += 6;
  doc.setFontSize(9);
  for (const ev of events.value.slice(0, 15)) {
    if (y > 270) {
      doc.addPage();
      y = 16;
    }
    doc.text(`${new Date(ev.ts * 1000).toISOString()} · ${ev.type} · ${ev.actor}`, 14, y);
    y += 5;
  }
  doc.save(`typing-race-admin-${Date.now()}.pdf`);
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold text-slate-100">User &amp; team performance</h2>
        <p class="mt-1 text-sm text-slate-500">
          Aggregates from ingested training sessions (results screen posts when admin is signed in).
        </p>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          @click="load"
        >
          Refresh
        </button>
        <button
          type="button"
          class="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
          @click="exportPdf"
        >
          Export PDF report
        </button>
      </div>
    </div>

    <p v-if="loadError" class="text-sm text-rose-400">{{ loadError }}</p>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p class="text-xs uppercase text-slate-500">Sessions</p>
        <p class="mt-1 text-2xl font-semibold text-slate-100">{{ overview?.session_count ?? "—" }}</p>
      </div>
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p class="text-xs uppercase text-slate-500">Avg WPM</p>
        <p class="mt-1 text-2xl font-semibold text-emerald-300">{{ overview?.avg_final_wpm ?? "—" }}</p>
      </div>
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p class="text-xs uppercase text-slate-500">Median WPM</p>
        <p class="mt-1 text-2xl font-semibold text-sky-300">{{ overview?.median_final_wpm ?? "—" }}</p>
      </div>
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <p class="text-xs uppercase text-slate-500">Peak WPM</p>
        <p class="mt-1 text-2xl font-semibold text-amber-300">{{ overview?.recent_peak_wpm ?? "—" }}</p>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 class="text-sm font-semibold text-slate-200">WPM history (blended)</h3>
        <p class="text-xs text-slate-500">Mean WPM at each timestep across ingested runs</p>
        <div class="mt-4 h-64">
          <Line :data="lineChartData" :options="lineOptions" />
        </div>
      </div>
      <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 class="text-sm font-semibold text-slate-200">Team comparison</h3>
        <p class="text-xs text-slate-500">Average final WPM by team (from session ingest)</p>
        <div class="mt-4 h-64">
          <Bar :data="barChartData" :options="barOptions" />
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h3 class="text-sm font-semibold text-slate-200">Latest sessions</h3>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-slate-500">
            <tr>
              <th class="py-2 pr-2">User</th>
              <th class="py-2 pr-2">Room</th>
              <th class="py-2 pr-2">WPM</th>
              <th class="py-2">Acc</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800 text-slate-300">
            <tr v-for="s in sessions.slice(0, 8)" :key="s.id">
              <td class="py-2 pr-2">{{ s.user_label ?? "—" }}</td>
              <td class="py-2 pr-2 font-mono text-xs">{{ s.room_id ?? "—" }}</td>
              <td class="py-2 pr-2">{{ s.final_wpm.toFixed(1) }}</td>
              <td class="py-2">{{ (s.accuracy * 100).toFixed(0) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
