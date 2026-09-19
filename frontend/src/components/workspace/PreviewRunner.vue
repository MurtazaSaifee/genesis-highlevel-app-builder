<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { highlevelClient } from "@/lib/highlevelClient";
import { bundlePreviewHtml } from "@/lib/previewBundler";
import {
  Terminal,
  Activity,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Radio,
  CheckCircle2,
  Clock,
} from "lucide-vue-next";

export interface ConsoleLogEntry {
  id: string;
  level: "log" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
}

export interface ApiActivityEntry {
  id: string;
  service: string;
  action: string;
  method: string;
  endpoint: string;
  timestamp: number;
  status: "pending" | number;
  durationMs?: number;
  params?: Record<string, unknown>;
  body?: unknown;
  response?: unknown;
  error?: string;
}

export interface RuntimeErrorEntry {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: number;
}

const workspaceStore = useWorkspaceStore();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const bundledHtml = ref<string>("");
const isCompiling = ref<boolean>(false);

// Drawer state
const isDrawerOpen = ref<boolean>(false);
const activeDrawerTab = ref<"console" | "network">("console");
const consoleFilter = ref<"all" | "error" | "warn" | "info">("all");

// Logs & Errors
const consoleLogs = ref<ConsoleLogEntry[]>([]);
const apiActivityLogs = ref<ApiActivityEntry[]>([]);
const activeRuntimeError = ref<RuntimeErrorEntry | null>(null);
const expandedApiLogIds = ref<Set<string>>(new Set());

// Debounce timer for manual edits
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const errorCount = computed(() => consoleLogs.value.filter((l) => l.level === "error").length);
const warnCount = computed(() => consoleLogs.value.filter((l) => l.level === "warn").length);

const filteredConsoleLogs = computed(() => {
  if (consoleFilter.value === "all") return consoleLogs.value;
  if (consoleFilter.value === "error") return consoleLogs.value.filter((l) => l.level === "error");
  if (consoleFilter.value === "warn") return consoleLogs.value.filter((l) => l.level === "warn");
  return consoleLogs.value.filter((l) => l.level === "info" || l.level === "log");
});

/**
 * Recompiles and updates iframe srcdoc
 */
function compileAndRender() {
  isCompiling.value = true;
  try {
    const html = bundlePreviewHtml(workspaceStore.files, {
      enableRpcBridge: true,
      enableConsoleCapture: true,
    });
    bundledHtml.value = html;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    activeRuntimeError.value = {
      message: `Bundle Compilation Error: ${msg}`,
      timestamp: Date.now(),
    };
  } finally {
    isCompiling.value = false;
  }
}

/**
 * Forces immediate reload of the preview
 */
function reload() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  activeRuntimeError.value = null;
  compileAndRender();
}

/**
 * Opens bundled preview in a new standalone browser tab via Blob URL
 */
function openExternal() {
  try {
    const html = bundlePreviewHtml(workspaceStore.files, {
      enableRpcBridge: false, // In popup window, fallback to direct fetch
      enableConsoleCapture: true,
    });
    const blob = new Blob([html], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } catch (err) {
    console.error("Failed to open external preview window:", err);
  }
}

function clearConsole() {
  consoleLogs.value = [];
  activeRuntimeError.value = null;
}

function clearApiLogs() {
  apiActivityLogs.value = [];
}

function toggleApiLogExpansion(id: string) {
  if (expandedApiLogIds.value.has(id)) {
    expandedApiLogIds.value.delete(id);
  } else {
    expandedApiLogIds.value.add(id);
  }
}

// Watch workspace files: debounce during user editing, skip during streaming
watch(
  () => workspaceStore.files,
  () => {
    if (workspaceStore.isStreaming) {
      // Avoid thrashing or reloading broken intermediate HTML while LLM is streaming
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      workspaceStore.triggerPreviewReload();
    }, 500);
  },
  { deep: true }
);

// Watch previewReloadKey: forces immediate re-render when triggered (e.g. on generation completion or project hydration)
watch(
  () => workspaceStore.previewReloadKey,
  () => {
    reload();
  }
);

// Watch streaming transition: when LLM finishes streaming, immediately trigger reload
watch(
  () => workspaceStore.isStreaming,
  (isStreamingNow, wasStreaming) => {
    if (wasStreaming && !isStreamingNow) {
      workspaceStore.triggerPreviewReload();
    }
  }
);

/**
 * Handles incoming postMessage events from the sandboxed iframe
 */
async function handleIframeMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  // Security Boundary Guard: Reject messages not originating from our sandboxed preview iframe
  if (!iframeRef.value?.contentWindow || event.source !== iframeRef.value.contentWindow) {
    return;
  }

  // 1. Console Log Interception
  if (data.type === "PREVIEW_CONSOLE_LOG" && data.payload) {
    const { level, message, timestamp } = data.payload;
    if (consoleLogs.value.length >= 500) {
      consoleLogs.value.shift(); // Bound memory to prevent runaway loop OOM
    }
    consoleLogs.value.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      level: level || "log",
      message: String(message),
      timestamp: timestamp || Date.now(),
    });
  }

  // 2. Runtime Error Interception
  else if (data.type === "PREVIEW_RUNTIME_ERROR" && data.payload) {
    const { message, source, line, column, stack, timestamp } = data.payload;
    activeRuntimeError.value = {
      message: String(message),
      source,
      line,
      column,
      stack,
      timestamp: timestamp || Date.now(),
    };
    if (consoleLogs.value.length >= 500) {
      consoleLogs.value.shift();
    }
    consoleLogs.value.push({
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      level: "error",
      message: `Runtime Error: ${message}${line ? ` (Line ${line}:${column || 0})` : ""}`,
      timestamp: timestamp || Date.now(),
    });
  }

  // 3. HighLevel API RPC Bridge
  else if (data.type === "HL_API_REQUEST") {
    const { reqId, service, action, endpoint, method, params, body } = data;
    const startTime = Date.now();

    const activityEntry: ApiActivityEntry = {
      id: reqId,
      service: service || "custom",
      action: action || "request",
      method: method || "GET",
      endpoint: endpoint || `/${service}`,
      timestamp: startTime,
      status: "pending",
      params,
      body,
    };
    if (apiActivityLogs.value.length >= 100) {
      apiActivityLogs.value.pop(); // Bound memory to prevent leak
    }
    apiActivityLogs.value.unshift(activityEntry);

    try {
      // Decoupled dispatch through HighLevel client SDK
      const resultData = await highlevelClient.dispatchRpc(
        service,
        action,
        endpoint,
        method,
        params,
        body
      );

      const durationMs = Date.now() - startTime;
      activityEntry.status = 200;
      activityEntry.durationMs = durationMs;
      activityEntry.response = resultData;

      // Post success back to iframe
      iframeRef.value?.contentWindow?.postMessage(
        {
          type: "HL_API_RESPONSE",
          reqId,
          success: true,
          data: resultData,
        },
        "*"
      );
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      activityEntry.status = 500;
      activityEntry.durationMs = durationMs;
      activityEntry.error = errorMsg;

      // Post failure back to iframe
      iframeRef.value?.contentWindow?.postMessage(
        {
          type: "HL_API_RESPONSE",
          reqId,
          success: false,
          error: errorMsg,
        },
        "*"
      );
    }
  }
}

onMounted(() => {
  window.addEventListener("message", handleIframeMessage);
  compileAndRender();
});

onUnmounted(() => {
  window.removeEventListener("message", handleIframeMessage);
  if (debounceTimer) clearTimeout(debounceTimer);
});

defineExpose({
  reload,
  openExternal,
  clearConsole,
  clearApiLogs,
});
</script>

<template>
  <div class="relative w-full h-full flex flex-col bg-white overflow-hidden select-none">
    <!-- Active Streaming Indicator Overlay Banner -->
    <div
      v-if="workspaceStore.isStreaming"
      class="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 shrink-0"
    >
      <div class="flex items-center gap-2">
        <Radio class="h-3.5 w-3.5 text-amber-500 animate-pulse" />
        <span class="font-medium text-[11px]">AI Streaming code updates...</span>
      </div>
      <span class="text-[10px] text-muted-foreground">Preview will update on completion</span>
    </div>

    <!-- Non-blocking Runtime Error Notification Banner -->
    <div
      v-if="activeRuntimeError"
      class="bg-destructive/10 border-b border-destructive/30 px-3 py-2 flex items-start justify-between text-xs text-destructive shrink-0 animate-in slide-in-from-top-1"
    >
      <div class="flex items-start gap-2 max-w-[90%]">
        <AlertCircle class="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p class="font-semibold text-[11px] leading-tight">{{ activeRuntimeError.message }}</p>
          <p v-if="activeRuntimeError.line" class="text-[10px] text-destructive/80 font-mono mt-0.5">
            Location: Line {{ activeRuntimeError.line }}{{ activeRuntimeError.column ? `:${activeRuntimeError.column}` : '' }}
          </p>
        </div>
      </div>
      <button
        type="button"
        @click="activeRuntimeError = null"
        class="text-destructive/70 hover:text-destructive p-0.5 rounded cursor-pointer"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Sandboxed Iframe Container -->
    <div class="flex-1 w-full h-full relative overflow-hidden bg-white">
      <iframe
        ref="iframeRef"
        :key="workspaceStore.previewReloadKey"
        :srcdoc="bundledHtml"
        class="w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        title="HighLevel Mini-App Live Preview"
      />
    </div>

    <!-- Collapsible Inspector Drawer (Console & HighLevel API Activity) -->
    <div
      :class="[
        'border-t border-border bg-card flex flex-col transition-all duration-200 shrink-0',
        isDrawerOpen ? 'h-52' : 'h-8',
      ]"
    >
      <!-- Drawer Header Bar -->
      <div
        class="h-8 px-2.5 bg-muted/60 border-b border-border flex items-center justify-between text-xs cursor-pointer select-none"
        @click="isDrawerOpen = !isDrawerOpen"
      >
        <!-- Tab Switchers -->
        <div class="flex items-center gap-1" @click.stop>
          <button
            type="button"
            @click="activeDrawerTab = 'console'; isDrawerOpen = true"
            :class="[
              'px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer',
              activeDrawerTab === 'console'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            <Terminal class="h-3 w-3" />
            <span>Console</span>
            <span
              v-if="errorCount > 0"
              class="px-1 py-0.2 rounded-full text-[9px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-bold"
            >
              {{ errorCount }}
            </span>
            <span
              v-if="warnCount > 0"
              class="px-1 py-0.2 rounded-full text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold"
            >
              {{ warnCount }}
            </span>
          </button>

          <button
            type="button"
            @click="activeDrawerTab = 'network'; isDrawerOpen = true"
            :class="[
              'px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer',
              activeDrawerTab === 'network'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            ]"
          >
            <Activity class="h-3 w-3" />
            <span>API Activity</span>
            <span
              v-if="apiActivityLogs.length > 0"
              class="px-1 py-0.2 rounded-full text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold"
            >
              {{ apiActivityLogs.length }}
            </span>
          </button>
        </div>

        <!-- Right Controls -->
        <div class="flex items-center gap-1 text-muted-foreground" @click.stop>
          <button
            type="button"
            @click="activeDrawerTab === 'console' ? clearConsole() : clearApiLogs()"
            class="p-1 hover:text-foreground rounded transition-colors cursor-pointer"
            :title="activeDrawerTab === 'console' ? 'Clear Console' : 'Clear API Logs'"
          >
            <Trash2 class="h-3 w-3" />
          </button>

          <button
            type="button"
            @click="isDrawerOpen = !isDrawerOpen"
            class="p-1 hover:text-foreground rounded transition-colors cursor-pointer"
            :title="isDrawerOpen ? 'Collapse Drawer' : 'Expand Drawer'"
          >
            <ChevronDown v-if="isDrawerOpen" class="h-3.5 w-3.5" />
            <ChevronUp v-else class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- Drawer Content Pane -->
      <div v-show="isDrawerOpen" class="flex-1 overflow-auto p-2 bg-background font-mono text-[11px]">
        <!-- 1. Console Tab -->
        <div v-if="activeDrawerTab === 'console'" class="space-y-1.5 h-full flex flex-col">
          <!-- Filter Controls -->
          <div class="flex items-center gap-1 pb-1 border-b border-border/50 text-[10px]">
            <span class="text-muted-foreground font-sans mr-1">Filter:</span>
            <button
              v-for="filter in ['all', 'error', 'warn', 'info'] as const"
              :key="filter"
              type="button"
              @click="consoleFilter = filter"
              :class="[
                'px-1.5 py-0.5 rounded capitalize transition-colors cursor-pointer',
                consoleFilter === filter
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              ]"
            >
              {{ filter }}
            </button>
          </div>

          <!-- Logs List -->
          <div class="flex-1 overflow-y-auto space-y-1">
            <div
              v-if="filteredConsoleLogs.length === 0"
              class="h-full flex items-center justify-center text-muted-foreground text-xs font-sans py-4"
            >
              No console logs recorded.
            </div>

            <div
              v-for="log in filteredConsoleLogs"
              :key="log.id"
              :class="[
                'p-1.5 rounded flex items-start gap-2 border leading-relaxed',
                log.level === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                  : log.level === 'warn'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                  : 'bg-muted/30 border-border/40 text-foreground',
              ]"
            >
              <AlertCircle v-if="log.level === 'error'" class="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
              <AlertTriangle v-else-if="log.level === 'warn'" class="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
              <Info v-else class="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />

              <div class="flex-1 break-all whitespace-pre-wrap">
                <span>{{ log.message }}</span>
              </div>
              <span class="text-[9px] text-muted-foreground font-sans shrink-0">
                {{ new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 2. API Activity Tab -->
        <div v-else-if="activeDrawerTab === 'network'" class="space-y-1.5 h-full overflow-y-auto">
          <div
            v-if="apiActivityLogs.length === 0"
            class="h-full flex flex-col items-center justify-center text-muted-foreground text-xs font-sans py-4"
          >
            <Activity class="h-6 w-6 text-muted-foreground/40 mb-1" />
            <span>No HighLevel API calls recorded yet.</span>
            <span class="text-[10px] text-muted-foreground/70 mt-0.5">
              Interact with the app in the preview to observe live CRM requests.
            </span>
          </div>

          <div
            v-for="entry in apiActivityLogs"
            :key="entry.id"
            class="border border-border/60 rounded p-2 bg-card hover:bg-muted/20 transition-colors"
          >
            <div
              class="flex items-center justify-between cursor-pointer"
              @click="toggleApiLogExpansion(entry.id)"
            >
              <div class="flex items-center gap-2">
                <span
                  :class="[
                    'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                    entry.method === 'GET'
                      ? 'bg-blue-500/15 text-blue-600'
                      : entry.method === 'POST'
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-amber-500/15 text-amber-600',
                  ]"
                >
                  {{ entry.method }}
                </span>
                <span class="font-medium text-foreground truncate max-w-[180px] sm:max-w-xs">
                  {{ entry.endpoint }}
                </span>
              </div>

              <div class="flex items-center gap-2 font-sans text-[10px]">
                <span
                  v-if="entry.status === 'pending'"
                  class="flex items-center gap-1 text-amber-600"
                >
                  <Clock class="h-3 w-3 animate-spin" />
                  <span>Pending</span>
                </span>
                <span
                  v-else-if="entry.status === 200"
                  class="flex items-center gap-1 text-emerald-600 font-semibold"
                >
                  <CheckCircle2 class="h-3 w-3" />
                  <span>200 OK</span>
                </span>
                <span v-else class="flex items-center gap-1 text-red-500 font-semibold">
                  <AlertCircle class="h-3 w-3" />
                  <span>{{ entry.status }} Error</span>
                </span>

                <span v-if="entry.durationMs !== undefined" class="text-muted-foreground text-[9px]">
                  {{ entry.durationMs }}ms
                </span>
              </div>
            </div>

            <!-- Expanded Payload / Response Inspector -->
            <div
              v-if="expandedApiLogIds.has(entry.id)"
              class="mt-2 pt-2 border-t border-border/40 text-[10px] space-y-1.5"
            >
              <div v-if="entry.params && Object.keys(entry.params).length > 0">
                <p class="text-muted-foreground font-sans font-medium text-[9px] uppercase">Query Params:</p>
                <pre class="p-1 rounded bg-muted/50 overflow-x-auto">{{ JSON.stringify(entry.params, null, 2) }}</pre>
              </div>

              <div v-if="entry.body">
                <p class="text-muted-foreground font-sans font-medium text-[9px] uppercase">Request Body:</p>
                <pre class="p-1 rounded bg-muted/50 overflow-x-auto">{{ JSON.stringify(entry.body, null, 2) }}</pre>
              </div>

              <div v-if="entry.response">
                <p class="text-muted-foreground font-sans font-medium text-[9px] uppercase">Response Data:</p>
                <pre class="p-1 rounded bg-muted/50 overflow-x-auto max-h-28">{{ JSON.stringify(entry.response, null, 2) }}</pre>
              </div>

              <div v-if="entry.error" class="text-red-500">
                <p class="font-sans font-medium text-[9px] uppercase">Error Details:</p>
                <p class="p-1 rounded bg-red-500/10">{{ entry.error }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
