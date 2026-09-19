<script setup lang="ts">
import { useAuthStore } from "@/stores/auth";
import { useHighLevelStore } from "@/stores/highlevel";
import { useSettingsStore } from "@/stores/settings";
import { useSnapshotsStore } from "@/stores/snapshots";
import { useWorkspaceStore, type WorkspacePanel } from "@/stores/workspace";
import Button from "@/components/ui/Button.vue";
import ProjectSelector from "@/components/workspace/ProjectSelector.vue";
import {
  Sparkles,
  Radio,
  SlidersHorizontal,
  LogOut,
  User,
  MessageSquare,
  Code2,
  Play,
  FlaskConical,
  Unplug,
  History,
} from "lucide-vue-next";

const authStore = useAuthStore();
const hlStore = useHighLevelStore();
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const snapshotsStore = useSnapshotsStore();

const emit = defineEmits<{
  (e: "signOut"): void;
}>();

function handlePanelClick(panel: WorkspacePanel) {
  workspaceStore.setActivePanel(panel);
}
</script>

<template>
  <header class="h-14 border-b border-border bg-card/70 backdrop-blur-md px-4 flex items-center justify-between sticky top-0 z-30 select-none">
    <!-- Brand & Project Section -->
    <div class="flex items-center gap-2 sm:gap-3">
      <div class="flex items-center gap-2 sm:gap-3">
        <div class="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-sm ring-1 ring-primary/20 shrink-0">
          <Sparkles class="h-4 w-4" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm tracking-tight text-foreground">Genesis</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 font-mono">
              v0.1
            </span>
          </div>
          <p class="text-[11px] text-muted-foreground hidden md:block">
            AI HighLevel App Builder
          </p>
        </div>
      </div>

      <div class="h-5 w-px bg-border/80 hidden sm:block"></div>

      <!-- Project Selector -->
      <ProjectSelector />

      <!-- Version History Trigger -->
      <button
        type="button"
        @click="snapshotsStore.toggleSheet"
        :class="[
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer shadow-2xs',
          snapshotsStore.isSheetOpen
            ? 'bg-primary text-primary-foreground border-primary'
            : 'border-border bg-card/80 hover:bg-muted/80 text-foreground',
        ]"
        title="View version history & snapshots"
      >
        <History class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="hidden md:inline">History</span>
        <span
          v-if="snapshotsStore.snapshotCount > 0"
          class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium bg-muted text-foreground border border-border/60"
        >
          {{ snapshotsStore.snapshotCount }}
        </span>
      </button>
    </div>

    <!-- Center: Mobile/Tablet Responsive Tab Switcher (<1024px) -->
    <div class="flex lg:hidden items-center bg-muted/80 p-1 rounded-lg border border-border">
      <button
        type="button"
        @click="handlePanelClick('chat')"
        :class="[
          'px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
          workspaceStore.activePanel === 'chat'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ]"
      >
        <MessageSquare class="h-3.5 w-3.5" />
        <span>Chat</span>
      </button>

      <button
        type="button"
        @click="handlePanelClick('code')"
        :class="[
          'px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
          workspaceStore.activePanel === 'code'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ]"
      >
        <Code2 class="h-3.5 w-3.5" />
        <span>Code</span>
      </button>

      <button
        type="button"
        @click="handlePanelClick('preview')"
        :class="[
          'px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
          workspaceStore.activePanel === 'preview'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        ]"
      >
        <Play class="h-3.5 w-3.5 text-emerald-500" />
        <span>Preview</span>
      </button>
    </div>

    <!-- Center: Desktop Panel Visibility Toggles (≥1024px) -->
    <div class="hidden lg:flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/80">
      <button
        type="button"
        @click="workspaceStore.togglePanel('chat')"
        :title="workspaceStore.showChat ? 'Hide Chat Panel' : 'Show Chat Panel'"
        :class="[
          'px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 cursor-pointer',
          workspaceStore.showChat
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground/60 hover:text-muted-foreground opacity-60',
        ]"
      >
        <MessageSquare class="h-3.5 w-3.5" />
        <span class="text-[11px]">Chat</span>
      </button>

      <button
        type="button"
        @click="workspaceStore.togglePanel('code')"
        :title="workspaceStore.showCode ? 'Hide Code Editor' : 'Show Code Editor'"
        :class="[
          'px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 cursor-pointer',
          workspaceStore.showCode
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground/60 hover:text-muted-foreground opacity-60',
        ]"
      >
        <Code2 class="h-3.5 w-3.5" />
        <span class="text-[11px]">Code</span>
      </button>

      <button
        type="button"
        @click="workspaceStore.togglePanel('preview')"
        :title="workspaceStore.showPreview ? 'Hide Live Preview' : 'Show Live Preview'"
        :class="[
          'px-2 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 cursor-pointer',
          workspaceStore.showPreview
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground/60 hover:text-muted-foreground opacity-60',
        ]"
      >
        <Play class="h-3.5 w-3.5 text-emerald-500" />
        <span class="text-[11px]">Preview</span>
      </button>
    </div>

    <!-- Right Actions -->
    <div class="flex items-center gap-2 sm:gap-3">
      <!-- HighLevel Status Badge (Clickable to open connect modal) -->
      <button
        type="button"
        @click="workspaceStore.openConnectModal"
        :title="hlStore.isConnected ? 'Manage HighLevel Location' : 'Connect HighLevel Location'"
        :class="[
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer',
          hlStore.isConnected
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
            : 'bg-muted/80 text-muted-foreground border-border hover:border-border/80 hover:text-foreground',
        ]"
      >
        <template v-if="hlStore.isConnected">
          <FlaskConical v-if="hlStore.isSandbox" class="h-3 w-3 text-amber-500 animate-pulse" />
          <Radio v-else class="h-3 w-3 text-blue-500 animate-pulse" />
          <span class="font-mono text-[11px] truncate max-w-[160px] md:max-w-xs">
            {{ hlStore.isSandbox ? 'Sandbox' : 'HL' }}: {{ hlStore.locationId }}
          </span>
        </template>
        <template v-else>
          <Unplug class="h-3 w-3 text-muted-foreground" />
          <span class="hidden sm:inline text-[11px]">Connect HighLevel</span>
          <span class="sm:hidden text-[11px]">Connect</span>
        </template>
      </button>

      <!-- BYOK LLM Settings Trigger -->
      <button
        type="button"
        @click="workspaceStore.openSettings"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-card hover:bg-muted text-foreground transition-all cursor-pointer"
        title="Configure LLM & BYOK Keys"
      >
        <SlidersHorizontal class="h-3.5 w-3.5 text-primary" />
        <span class="hidden md:inline font-mono text-[11px]">
          {{ settingsStore.model }}
        </span>
        <span class="md:hidden text-[11px]">BYOK</span>
        <span
          v-if="settingsStore.hasCustomKey"
          class="h-1.5 w-1.5 rounded-full bg-emerald-500"
          title="Custom API key configured"
        ></span>
      </button>

      <!-- Firebase Emulator Indicator (hidden on smallest screens) -->
      <div class="hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/20">
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        <span>Emulator</span>
      </div>

      <!-- User Profile & Sign Out -->
      <div class="flex items-center gap-2 pl-1 border-l border-border">
        <div
          class="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium"
          :title="authStore.userEmail || ''"
        >
          <User class="h-3.5 w-3.5 text-muted-foreground" />
          <span class="max-w-[100px] truncate text-[11px]">
            {{ authStore.userEmail ? authStore.userEmail.split('@')[0] : "User" }}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          @click="emit('signOut')"
          :loading="authStore.loading"
          class="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          title="Sign Out"
        >
          <LogOut class="h-3.5 w-3.5" />
          <span class="hidden sm:inline ml-1">Exit</span>
        </Button>
      </div>
    </div>
  </header>
</template>
