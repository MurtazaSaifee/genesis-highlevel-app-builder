import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import WorkspaceView from "@/views/WorkspaceView.vue";
import LoginView from "@/views/LoginView.vue";
import RegisterView from "@/views/RegisterView.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "workspace",
    component: WorkspaceView,
    meta: { requiresAuth: true },
  },
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { guestOnly: true },
  },
  {
    path: "/register",
    name: "register",
    component: RegisterView,
    meta: { guestOnly: true },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Wait for initial Firebase auth state to resolve (from IndexedDB / local storage)
  await authStore.waitForAuthInit();

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({
      path: "/login",
      query: to.fullPath !== "/" ? { redirect: to.fullPath } : undefined,
    });
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return next({ path: "/" });
  }

  return next();
});

export default router;
