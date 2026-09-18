<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import {
  Sparkles,
  LogOut,
  User,
  ShieldCheck,
  CheckCircle2,
  Terminal,
} from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();

async function handleSignOut() {
  try {
    await authStore.signOut();
    router.push("/login");
  } catch (err) {
    console.error("Sign out error:", err);
  }
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <!-- Top Navigation Bar -->
    <header class="h-14 border-b border-border bg-card/50 backdrop-blur px-4 flex items-center justify-between sticky top-0 z-10">
      <div class="flex items-center gap-3">
        <div class="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm">
          <Sparkles class="h-4 w-4" />
        </div>
        <div>
          <span class="font-bold text-sm tracking-tight text-foreground">Genesis</span>
          <span class="ml-2 hidden sm:inline-block text-xs text-muted-foreground border-l border-border pl-2">
            AI-Powered HighLevel App Builder
          </span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Emulator Status Pill -->
        <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-500/20">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Firebase Emulator Active</span>
        </div>

        <!-- User Profile Pill -->
        <div class="flex items-center gap-2 px-3 py-1 rounded-md bg-secondary/80 text-secondary-foreground text-xs">
          <User class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="font-medium max-w-[180px] truncate" :title="authStore.userEmail">
            {{ authStore.userEmail || "Authenticated User" }}
          </span>
        </div>

        <!-- Sign Out Button -->
        <Button
          variant="outline"
          size="sm"
          @click="handleSignOut"
          :loading="authStore.loading"
          class="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut class="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </Button>
      </div>
    </header>

    <!-- Main Workspace Area -->
    <main class="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col justify-center items-center">
      <div class="w-full max-w-2xl space-y-6">
        <!-- Success Welcome Card -->
        <Card>
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <ShieldCheck class="h-5 w-5" />
              </div>
              <div>
                <h2 class="text-lg font-semibold tracking-tight text-foreground">
                  Authentication Verified & Workspace Protected
                </h2>
                <p class="text-xs text-muted-foreground">
                  Task 03 (Firebase Authentication) successfully implemented.
                </p>
              </div>
            </div>

            <div class="p-4 rounded-lg bg-muted/40 border border-border/80 space-y-2 text-xs">
              <div class="flex justify-between items-center py-1 border-b border-border/50">
                <span class="text-muted-foreground">Current User:</span>
                <span class="font-mono font-medium text-foreground">{{ authStore.userEmail }}</span>
              </div>
              <div class="flex justify-between items-center py-1 border-b border-border/50">
                <span class="text-muted-foreground">User UID:</span>
                <span class="font-mono text-muted-foreground truncate max-w-[260px]">{{ authStore.userId }}</span>
              </div>
              <div class="flex justify-between items-center py-1">
                <span class="text-muted-foreground">Pinia Auth Status:</span>
                <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 class="h-3.5 w-3.5" />
                  Authenticated & Session Persistent
                </span>
              </div>
            </div>

            <div class="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <div class="flex items-center gap-1.5">
                <Terminal class="h-3.5 w-3.5 text-primary" />
                <span>Next Step: <strong>Task 04 — HighLevel OAuth 2.0 Integration</strong></span>
              </div>
              <span class="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">Phase 2</span>
            </div>
          </div>
        </Card>
      </div>
    </main>
  </div>
</template>
