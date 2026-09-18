import { defineStore } from "pinia";
import { ref } from "vue";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db, auth } from "../lib/firebase.ts";
import { useAuthStore } from "./auth.ts";

export interface HighLevelIntegrationState {
  userId: string;
  locationId: string;
  companyId?: string;
  highLevelUserId?: string;
  expiresAt: number;
  scopes: string[];
  isSandbox: boolean;
  status: "connected" | "disconnected" | "expired";
}

export const useHighLevelStore = defineStore("highlevel", () => {
  const authStore = useAuthStore();

  const isConnected = ref<boolean>(false);
  const locationId = ref<string | null>(null);
  const companyId = ref<string | null>(null);
  const isSandbox = ref<boolean>(false);
  const expiresAt = ref<number | null>(null);
  const scopes = ref<string[]>([]);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);
  const successNotification = ref<string | null>(null);

  let unsubscribeSnapshot: Unsubscribe | null = null;

  const functionsBaseUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_FUNCTIONS_URL) ||
    (typeof process !== "undefined" && process.env?.VITE_FUNCTIONS_URL) ||
    "http://127.0.0.1:5001/genesis-hl-builder-1/us-central1";

  /**
   * Start real-time Firestore sync with /users/{userId}/integrations/highlevel
   */
  function startListening(userId: string) {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }

    if (!userId) return;

    const docRef = doc(db, "users", userId, "integrations", "highlevel");
    unsubscribeSnapshot = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as HighLevelIntegrationState;
          if (data.status === "connected") {
            isConnected.value = true;
            locationId.value = data.locationId || null;
            companyId.value = data.companyId || null;
            isSandbox.value = !!data.isSandbox;
            expiresAt.value = data.expiresAt || null;
            scopes.value = data.scopes || [];
            authStore.setActiveLocation(data.locationId || null);
            return;
          }
        }
        // Integration document is missing or marked disconnected
        isConnected.value = false;
        locationId.value = null;
        companyId.value = null;
        isSandbox.value = false;
        expiresAt.value = null;
        scopes.value = [];
        authStore.setActiveLocation(null);
      },
      (err) => {
        console.warn("[HighLevel Store] Snapshot listener warning:", err);
      }
    );
  }

  function stopListening() {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
  }

  async function getAuthHeader(): Promise<Record<string, string>> {
    const idToken = await auth.currentUser?.getIdToken();
    if (idToken) {
      return { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
    }
    return { "Content-Type": "application/json" };
  }

  /**
   * Fetch authorization URL from backend and redirect user to HighLevel authorization flow
   */
  async function initiateOAuth() {
    loading.value = true;
    error.value = null;
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${functionsBaseUrl}/getAuthUrl`, {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: authStore.userId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to initiate OAuth (HTTP ${res.status})`);
      }

      const { authUrl } = await res.json();
      if (!authUrl) {
        throw new Error("No authorization URL returned by server.");
      }

      window.location.href = authUrl;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to initiate HighLevel connection.";
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 1-Click Reviewer Fallback: Connect Demo Sandbox location without live credentials
   */
  async function connectDemoSandbox(customLocationId?: string) {
    loading.value = true;
    error.value = null;
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${functionsBaseUrl}/connectSandbox`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: authStore.userId,
          locationId: customLocationId || "sandbox-location-genesis",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Sandbox connection failed (HTTP ${res.status})`);
      }

      const result = await res.json();
      isConnected.value = true;
      locationId.value = result.locationId;
      isSandbox.value = true;
      authStore.setActiveLocation(result.locationId);
      successNotification.value = "Demo Sandbox Location connected successfully!";
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to connect Demo Sandbox.";
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Disconnect integration and clear Firestore credentials
   */
  async function disconnect() {
    loading.value = true;
    error.value = null;
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${functionsBaseUrl}/disconnectHighLevel`, {
        method: "POST",
        headers,
        body: JSON.stringify({ userId: authStore.userId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Disconnect failed (HTTP ${res.status})`);
      }

      isConnected.value = false;
      locationId.value = null;
      companyId.value = null;
      isSandbox.value = false;
      expiresAt.value = null;
      scopes.value = [];
      authStore.setActiveLocation(null);
      successNotification.value = "HighLevel integration disconnected.";
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to disconnect HighLevel.";
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Parse incoming redirect query params (e.g., ?hl_connected=true or ?hl_error=...)
   */
  function handleUrlCallback(params: URLSearchParams) {
    if (params.has("hl_connected")) {
      const locId = params.get("location_id");
      successNotification.value = locId
        ? `HighLevel connected successfully! Location: ${locId}`
        : "HighLevel account connected successfully!";
      // Clean query parameters from URL without page reload
      const url = new URL(window.location.href);
      url.searchParams.delete("hl_connected");
      url.searchParams.delete("location_id");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    } else if (params.has("hl_error")) {
      error.value = params.get("hl_error") || "Failed to complete HighLevel OAuth.";
      const url = new URL(window.location.href);
      url.searchParams.delete("hl_error");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }
  }

  function clearNotifications() {
    error.value = null;
    successNotification.value = null;
  }

  return {
    isConnected,
    locationId,
    companyId,
    isSandbox,
    expiresAt,
    scopes,
    loading,
    error,
    successNotification,
    startListening,
    stopListening,
    initiateOAuth,
    connectDemoSandbox,
    disconnect,
    handleUrlCallback,
    clearNotifications,
  };
});
