<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

onMounted(() => {
  const search = window.location.search;
  const functionsBaseUrl =
    import.meta.env.VITE_FUNCTIONS_BASE_URL ||
    "http://127.0.0.1:5001/genesis-hl-builder-1/us-central1";

  // If there is an error from HighLevel, forward directly back to workspace
  if (route.query.error || route.query.error_description) {
    const errorMsg = String(route.query.error_description || route.query.error);
    window.location.href = `/?hl_error=${encodeURIComponent(errorMsg)}`;
    return;
  }

  // Forward code and state to backend Cloud Function for token exchange
  if (route.query.code && route.query.state) {
    window.location.href = `${functionsBaseUrl}/oauthCallback${search}`;
    return;
  }

  // Fallback
  window.location.href = "/";
});
</script>

<template>
  <div class="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground space-y-4">
    <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    <p class="text-sm text-muted-foreground font-medium">Connecting your HighLevel account...</p>
  </div>
</template>
