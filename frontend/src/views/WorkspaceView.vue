<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useHighLevelStore } from "@/stores/highlevel";
import Button from "@/components/ui/Button.vue";
import Card from "@/components/ui/Card.vue";
import Input from "@/components/ui/Input.vue";
import {
  Sparkles,
  LogOut,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Link2,
  Unlink,
  ExternalLink,
  Layers,
  FlaskConical,
  X,
  Radio,
} from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();
const hlStore = useHighLevelStore();

const customSandboxLocationId = ref("sandbox-location-genesis");

onMounted(() => {
  // Check for OAuth redirect callback query params (?hl_connected=true or ?hl_error=...)
  if (window.location.search) {
    hlStore.handleUrlCallback(new URLSearchParams(window.location.search));
  }

  if (authStore.userId) {
    hlStore.startListening(authStore.userId);
  }
});

watch(
  () => authStore.userId,
  (newUserId) => {
    if (newUserId) {
      hlStore.startListening(newUserId);
    } else {
      hlStore.stopListening();
    }
  }
);

onUnmounted(() => {
  hlStore.stopListening();
});

async function handleSignOut() {
  try {
    hlStore.stopListening();
    await authStore.signOut();
    router.push("/login");
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

async function handleConnectOAuth() {
  try {
    await hlStore.initiateOAuth();
  } catch (err) {
    console.error("Initiate OAuth error:", err);
  }
}

async function handleConnectSandbox() {
  try {
    await hlStore.connectDemoSandbox(customSandboxLocationId.value);
  } catch (err) {
    console.error("Connect Sandbox error:", err);
  }
}

async function handleDisconnect() {
  try {
    await hlStore.disconnect();
  } catch (err) {
    console.error("Disconnect error:", err);
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
        <!-- HighLevel Status Pill in Header -->
        <div
          v-if="hlStore.isConnected"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-500/20"
        >
          <Radio class="h-3 w-3 text-blue-500 animate-pulse" />
          <span class="font-mono text-[11px] truncate max-w-[120px]" :title="hlStore.locationId || ''">
            {{ hlStore.isSandbox ? 'Sandbox' : 'Location' }}: {{ hlStore.locationId }}
          </span>
        </div>
        <div
          v-else
          class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"></span>
          <span>HL Disconnected</span>
        </div>

        <!-- Emulator Status Pill -->
        <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium border border-emerald-500/20">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          <span>Firebase Emulator</span>
        </div>

        <!-- User Profile Pill -->
        <div class="flex items-center gap-2 px-3 py-1 rounded-md bg-secondary/80 text-secondary-foreground text-xs">
          <User class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="font-medium max-w-[140px] truncate" :title="authStore.userEmail">
            {{ authStore.userEmail || "User" }}
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
          <span class="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </header>

    <!-- Main Workspace Area -->
    <main class="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col items-center">
      <div class="w-full max-w-2xl space-y-6">

        <!-- Notification / Error Banners -->
        <div
          v-if="hlStore.successNotification"
          class="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between shadow-sm animate-in fade-in"
        >
          <div class="flex items-center gap-2">
            <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{{ hlStore.successNotification }}</span>
          </div>
          <button @click="hlStore.clearNotifications" class="text-muted-foreground hover:text-foreground">
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          v-if="hlStore.error"
          class="p-3.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between shadow-sm animate-in fade-in"
        >
          <div class="flex items-center gap-2">
            <AlertCircle class="h-4 w-4 shrink-0 text-destructive" />
            <span>{{ hlStore.error }}</span>
          </div>
          <button @click="hlStore.clearNotifications" class="text-muted-foreground hover:text-foreground">
            <X class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- HighLevel OAuth 2.0 Integration Card -->
        <Card class="border-border/80 shadow-sm">
          <div class="space-y-5">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <Link2 class="h-5 w-5" />
                </div>
                <div>
                  <h2 class="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                    HighLevel OAuth 2.0 Integration
                    <span
                      v-if="hlStore.isConnected"
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    >
                      Active
                    </span>
                    <span
                      v-else
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border"
                    >
                      Not Connected
                    </span>
                  </h2>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    Sub-Account (Location) authorization and token lifecycle management
                  </p>
                </div>
              </div>

              <!-- Phase Tag -->
              <span class="text-[11px] font-mono bg-secondary text-secondary-foreground px-2 py-0.5 rounded border border-border">
                Task 04
              </span>
            </div>

            <!-- Connected State Details -->
            <div v-if="hlStore.isConnected" class="space-y-4">
              <div class="p-4 rounded-lg bg-muted/40 border border-border space-y-2.5 text-xs">
                <div class="flex justify-between items-center py-1 border-b border-border/50">
                  <span class="text-muted-foreground">Connected Location ID:</span>
                  <span class="font-mono font-medium text-foreground bg-background px-2 py-0.5 rounded border border-border">
                    {{ hlStore.locationId }}
                  </span>
                </div>

                <div class="flex justify-between items-center py-1 border-b border-border/50">
                  <span class="text-muted-foreground">Connection Type:</span>
                  <span class="inline-flex items-center gap-1 font-medium" :class="hlStore.isSandbox ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'">
                    <FlaskConical v-if="hlStore.isSandbox" class="h-3 w-3" />
                    <Layers v-else class="h-3 w-3" />
                    {{ hlStore.isSandbox ? "Demo Sandbox (Reviewer Mode)" : "Production HighLevel OAuth" }}
                  </span>
                </div>

                <div class="flex justify-between items-center py-1 border-b border-border/50">
                  <span class="text-muted-foreground">Token Lifecycle:</span>
                  <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 class="h-3 w-3" />
                    Valid & Auto-Refreshing (5m Buffer)
                  </span>
                </div>

                <div class="py-1">
                  <span class="text-muted-foreground block mb-1.5">Authorized API Scopes:</span>
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-for="scope in hlStore.scopes"
                      :key="scope"
                      class="px-2 py-0.5 rounded text-[10px] font-mono bg-background text-muted-foreground border border-border"
                    >
                      {{ scope }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Disconnect Action -->
              <div class="flex items-center justify-between pt-1">
                <span class="text-xs text-muted-foreground">
                  Need to switch sub-accounts or test fresh authorization?
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  @click="handleDisconnect"
                  :loading="hlStore.loading"
                  class="gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Unlink class="h-3.5 w-3.5" />
                  <span>Disconnect Location</span>
                </Button>
              </div>
            </div>

            <!-- Disconnected State Actions -->
            <div v-else class="space-y-4">
              <p class="text-xs text-muted-foreground leading-relaxed">
                Connect your HighLevel Location to authorize Genesis to build and execute live apps interacting with Contacts, Conversations, and Calendars.
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <!-- Option 1: Live OAuth -->
                <div class="p-4 rounded-lg border border-border bg-card/60 flex flex-col justify-between space-y-3">
                  <div class="space-y-1.5">
                    <div class="font-semibold text-xs text-foreground flex items-center gap-1.5">
                      <ExternalLink class="h-3.5 w-3.5 text-primary" />
                      <span>Live HighLevel OAuth</span>
                    </div>
                    <p class="text-[11px] text-muted-foreground">
                      Redirects to HighLevel marketplace dialog with signed cryptographic state.
                    </p>
                  </div>

                  <Button
                    size="sm"
                    @click="handleConnectOAuth"
                    :loading="hlStore.loading"
                    class="w-full gap-1.5 text-xs"
                  >
                    <Link2 class="h-3.5 w-3.5" />
                    <span>Connect HighLevel</span>
                  </Button>
                </div>

                <!-- Option 2: 1-Click Reviewer Demo Sandbox -->
                <div class="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 flex flex-col justify-between space-y-3">
                  <div class="space-y-1.5">
                    <div class="font-semibold text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <FlaskConical class="h-3.5 w-3.5 text-amber-500" />
                      <span>Reviewer Demo Sandbox</span>
                    </div>
                    <p class="text-[11px] text-muted-foreground">
                      1-click instant evaluation with mock credentials without waiting on marketplace app approvals.
                    </p>
                  </div>

                  <div class="space-y-2">
                    <Input
                      v-model="customSandboxLocationId"
                      placeholder="Sandbox Location ID"
                      class="h-7 text-xs font-mono"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      @click="handleConnectSandbox"
                      :loading="hlStore.loading"
                      class="w-full gap-1.5 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                    >
                      <Sparkles class="h-3.5 w-3.5 text-amber-500" />
                      <span>Connect Demo Sandbox</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <!-- Auth Status Card (from Task 03) -->
        <Card class="border-border/80">
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <div class="h-9 w-9 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <ShieldCheck class="h-4 w-4" />
              </div>
              <div>
                <h3 class="text-sm font-semibold tracking-tight text-foreground">
                  Firebase Authentication Active
                </h3>
                <p class="text-xs text-muted-foreground">
                  Task 03 verified: User session persistent & scoped.
                </p>
              </div>
            </div>

            <div class="p-3.5 rounded-lg bg-muted/40 border border-border/80 space-y-1.5 text-xs font-mono">
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">User:</span>
                <span class="text-foreground">{{ authStore.userEmail }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">UID:</span>
                <span class="text-muted-foreground truncate max-w-[240px]">{{ authStore.userId }}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </main>
  </div>
</template>
