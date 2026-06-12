import { createRouter, createWebHistory } from "vue-router";
import { useAdminAuthStore } from "../stores/adminAuth";
import { useGameStore } from "../stores/game";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "join",
      component: () => import("../views/JoinView.vue"),
    },
    {
      path: "/lobby",
      name: "lobby",
      component: () => import("../views/LobbyView.vue"),
      meta: { requiresJoin: true },
    },
    {
      path: "/game",
      name: "game",
      component: () => import("../views/GameView.vue"),
      meta: { requiresJoin: true },
    },
    {
      path: "/results",
      name: "results",
      component: () => import("../views/ResultsView.vue"),
      meta: { requiresJoin: true, requiresResults: true },
    },
    {
      path: "/admin/login",
      name: "admin-login",
      component: () => import("../views/admin/AdminLoginView.vue"),
    },
    {
      path: "/admin",
      component: () => import("../views/admin/AdminAppLayout.vue"),
      meta: { requiresAdminAuth: true },
      children: [
        {
          path: "",
          name: "admin-overview",
          component: () => import("../views/admin/AdminOverviewView.vue"),
        },
        {
          path: "sessions",
          name: "admin-sessions",
          component: () => import("../views/admin/AdminSessionsView.vue"),
        },
        {
          path: "events",
          name: "admin-managed-events",
          component: () => import("../views/admin/AdminManagedEventsView.vue"),
        },
        {
          path: "events/new",
          name: "admin-event-new",
          component: () => import("../views/admin/AdminEventWizardView.vue"),
        },
        {
          path: "events/:id/control",
          name: "admin-event-control",
          component: () => import("../views/admin/AdminEventControlView.vue"),
        },
        {
          path: "audit",
          name: "admin-events",
          component: () => import("../views/admin/AdminEventsView.vue"),
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const adminAuth = useAdminAuthStore();

  if (to.name === "admin-login") {
    await adminAuth.hydrateFromStorage();
    if (adminAuth.token) {
      return { path: "/admin" };
    }
    return true;
  }

  const needsAdmin = to.matched.some((r) => r.meta.requiresAdminAuth);
  if (needsAdmin) {
    await adminAuth.hydrateFromStorage();
    if (!adminAuth.token) {
      return { name: "admin-login", query: { redirect: to.fullPath } };
    }
  }

  const game = useGameStore();
  if (to.meta.requiresJoin && !game.playerId) {
    return { name: "join" };
  }
  if (to.meta.requiresResults && game.finalStandings.length === 0) {
    return game.playerId ? { name: "game" } : { name: "join" };
  }
  return true;
});

export default router;
