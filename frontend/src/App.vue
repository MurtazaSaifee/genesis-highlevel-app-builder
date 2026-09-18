<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();

onMounted(() => {
  authStore.initAuth();
});
</script>

<template>
  <div class="min-h-screen bg-background text-foreground antialiased">
    <router-view />
  </div>
</template>
