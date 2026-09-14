<script setup lang="ts">
import { ref } from "vue";

const appName = ref("Genesis");
const subtitle = ref("AI-Powered HighLevel App Builder");
</script>

<template>
  <main class="min-h-screen flex flex-col items-center justify-center p-6 text-center">
    <div class="max-w-md w-full space-y-4 rounded-xl border bg-card p-8 shadow-sm">
      <div class="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xl font-bold">
        G
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-foreground">{{ appName }}</h1>
      <p class="text-sm text-muted-foreground">{{ subtitle }}</p>
      <div class="pt-4 border-t border-border flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
        <span>Environment Scaffolded & Ready</span>
      </div>
    </div>
  </main>
</template>
