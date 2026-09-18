<script setup lang="ts">
import { computed } from "vue";
import { useWorkspaceStore, DEVICE_WIDTHS, type PreviewDevice } from "@/stores/workspace";
import {
  Monitor,
  Tablet,
  Smartphone,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  Globe,
} from "lucide-vue-next";

const workspaceStore = useWorkspaceStore();

const currentWidth = computed(() => DEVICE_WIDTHS[workspaceStore.previewDevice]);

const emit = defineEmits<{
  (e: "refresh"): void;
  (e: "openExternal"): void;
}>();

function handleDeviceSelect(device: PreviewDevice) {
  workspaceStore.setPreviewDevice(device);
}
</script>

<template>
  <div class="h-full flex flex-col bg-card overflow-hidden">
    <!-- Header with URL Bar & Responsive Device Switchers -->
    <div class="h-10 px-2 sm:px-3 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
      <!-- Simulated Address Bar -->
      <div class="flex items-center gap-1.5 flex-1 max-w-[200px] sm:max-w-xs bg-background px-2 py-1 rounded-md border border-border/80 text-[11px] font-mono text-muted-foreground truncate">
        <ShieldCheck class="h-3 w-3 text-emerald-500 shrink-0" />
        <span class="truncate">sandbox://highlevel-app</span>
      </div>

      <!-- Center: Responsive Device Mode Toggles -->
      <div class="flex items-center bg-muted/70 p-0.5 rounded-md border border-border/80 mx-2">
        <button
          type="button"
          @click="handleDeviceSelect('desktop')"
          :title="'Desktop View (100%)'"
          :class="[
            'p-1 rounded text-xs transition-all cursor-pointer',
            workspaceStore.previewDevice === 'desktop'
              ? 'bg-background text-foreground shadow-xs font-medium'
              : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          <Monitor class="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          @click="handleDeviceSelect('tablet')"
          :title="'Tablet View (768px)'"
          :class="[
            'p-1 rounded text-xs transition-all cursor-pointer',
            workspaceStore.previewDevice === 'tablet'
              ? 'bg-background text-foreground shadow-xs font-medium'
              : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          <Tablet class="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          @click="handleDeviceSelect('mobile')"
          :title="'Mobile View (375px)'"
          :class="[
            'p-1 rounded text-xs transition-all cursor-pointer',
            workspaceStore.previewDevice === 'mobile'
              ? 'bg-background text-foreground shadow-xs font-medium'
              : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          <Smartphone class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          @click="emit('refresh')"
          class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Reload Preview"
        >
          <RotateCw class="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          @click="emit('openExternal')"
          class="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Open in new window"
        >
          <ExternalLink class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Preview Viewport Container -->
    <div class="flex-1 bg-muted/20 overflow-auto p-2 sm:p-4 flex items-center justify-center">
      <!-- Device Frame Wrapper -->
      <div
        :style="{ width: currentWidth }"
        :class="[
          'h-full transition-all duration-300 flex flex-col bg-background overflow-hidden relative shadow-md',
          workspaceStore.previewDevice !== 'desktop'
            ? 'rounded-2xl border-4 border-slate-700 max-h-[92%] ring-1 ring-black/10'
            : 'border border-border/70 rounded-lg',
        ]"
      >
        <!-- Mobile/Tablet Speaker Bar Simulation -->
        <div
          v-if="workspaceStore.previewDevice !== 'desktop'"
          class="h-4 bg-slate-700 shrink-0 flex items-center justify-center"
        >
          <div class="w-10 h-1 bg-slate-500 rounded-full"></div>
        </div>

        <div class="flex-1 w-full h-full relative overflow-hidden bg-white">
          <slot name="preview">
            <!-- Sandboxed Live Preview Placeholder Shell (Task 11 runner) -->
            <div class="h-full w-full flex flex-col items-center justify-center p-6 text-center text-slate-500 select-none">
              <Globe class="h-10 w-10 text-slate-400 mb-3" />
              <p class="font-semibold text-xs text-slate-700">Sandboxed Live Preview Engine</p>
              <p class="text-[11px] text-slate-400 max-w-xs mt-1">
                Renders generated code inside an isolated sandbox with HighLevel API proxy runtime.
              </p>
              <span class="mt-3 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500">
                Mounting in Task 11
              </span>
            </div>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>
