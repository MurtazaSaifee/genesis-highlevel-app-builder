<script setup lang="ts">
import { ref } from "vue";
import { useHighLevelStore } from "@/stores/highlevel";
import { useWorkspaceStore } from "@/stores/workspace";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import {
  Link2,
  Unlink,
  ExternalLink,
  FlaskConical,
  Layers,
  CheckCircle2,
  Sparkles,
} from "lucide-vue-next";

const hlStore = useHighLevelStore();
const workspaceStore = useWorkspaceStore();

const customSandboxLocationId = ref("sandbox-location-genesis");

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
    workspaceStore.closeConnectModal();
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
  <Dialog
    :open="workspaceStore.isConnectModalOpen"
    @update:open="(val) => (val ? workspaceStore.openConnectModal() : workspaceStore.closeConnectModal())"
    title="HighLevel Sub-Account Connection"
    description="Connect Genesis to your HighLevel Location to generate apps with real CRM Contacts, Conversations, and Calendars."
    maxWidth="max-w-lg"
  >
    <!-- Connected State View -->
    <div v-if="hlStore.isConnected" class="space-y-4 pt-1 text-xs">
      <div class="p-3.5 rounded-lg bg-muted/40 border border-border space-y-2.5">
        <div class="flex justify-between items-center py-1 border-b border-border/50">
          <span class="text-muted-foreground">Connected Location ID:</span>
          <span class="font-mono font-medium text-foreground bg-background px-2 py-0.5 rounded border border-border">
            {{ hlStore.locationId }}
          </span>
        </div>

        <div class="flex justify-between items-center py-1 border-b border-border/50">
          <span class="text-muted-foreground">Connection Type:</span>
          <span
            class="inline-flex items-center gap-1 font-medium"
            :class="hlStore.isSandbox ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'"
          >
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

      <div class="flex items-center justify-between pt-2 border-t border-border">
        <span class="text-muted-foreground text-[11px]">
          Disconnect to switch location or revoke access.
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

    <!-- Disconnected State: Connection Options -->
    <div v-else class="space-y-3 pt-1 text-xs">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <!-- Option 1: Live OAuth -->
        <div class="p-3.5 rounded-lg border border-border bg-card/60 flex flex-col justify-between space-y-3">
          <div class="space-y-1">
            <div class="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <ExternalLink class="h-3.5 w-3.5 text-primary" />
              <span>Live HighLevel OAuth</span>
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              Redirects to official HighLevel OAuth dialog to authorize your sub-account.
            </p>
          </div>

          <Button
            size="sm"
            @click="handleConnectOAuth"
            :loading="hlStore.loading"
            class="w-full gap-1.5 text-xs"
          >
            <Link2 class="h-3.5 w-3.5" />
            <span>Connect OAuth</span>
          </Button>
        </div>

        <!-- Option 2: 1-Click Reviewer Demo Sandbox -->
        <div class="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 flex flex-col justify-between space-y-3">
          <div class="space-y-1">
            <div class="font-semibold text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <FlaskConical class="h-3.5 w-3.5 text-amber-500" />
              <span>Reviewer Sandbox</span>
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              1-click instant evaluation with realistic mock contacts, appointments, and messages.
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
              <span>Connect Sandbox</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>
