<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";
import Button from "@/components/ui/Button.vue";
import {
  MessageSquare,
  Sparkles,
  Send,
  Square,
  RotateCcw,
  Bot,
  User,
  UserCheck,
  Calendar,
  Terminal,
  FileCode,
  Layers,
  FileJson,
  FileText,
  AlertCircle,
  Zap,
  Loader2,
  CornerDownLeft,
} from "lucide-vue-next";

const workspaceStore = useWorkspaceStore();
const settingsStore = useSettingsStore();

const emit = defineEmits<{
  (e: "promptSelected", promptText: string): void;
}>();

const promptInput = ref("");
const messagesContainerRef = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const SAMPLE_PROMPTS = [
  {
    title: "HighLevel Lead Intake Form",
    prompt: "Create a modern contact lead intake form that saves new contacts to HighLevel with first name, last name, email, phone, and tags.",
    icon: UserCheck,
  },
  {
    title: "Appointment Booking Widget",
    prompt: "Build an interactive calendar appointment scheduler that loads real calendars from HighLevel and books new appointments.",
    icon: Calendar,
  },
  {
    title: "CRM Conversation Messenger",
    prompt: "Build a real-time conversation viewer that displays recent SMS and email messages from HighLevel conversations with a reply box.",
    icon: MessageSquare,
  },
];

function scrollToBottom(force = false) {
  nextTick(() => {
    const el = messagesContainerRef.value;
    if (!el) return;
    if (force) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    const isNearBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 80;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

watch(
  () => workspaceStore.messages.length,
  () => {
    scrollToBottom(true);
  }
);

// Auto-scroll as streaming chunks arrive in active message (respects manual scroll)
watch(
  () => {
    const activeMsg = workspaceStore.messages.find(
      (m) => m.id === workspaceStore.activeStreamingMessageId
    );
    return activeMsg?.content;
  },
  () => {
    scrollToBottom(false);
  }
);

onMounted(() => {
  scrollToBottom(true);
});

function handleSubmit() {
  const text = promptInput.value.trim();
  if (!text || workspaceStore.isStreaming) return;

  promptInput.value = "";
  emit("promptSelected", text);
  workspaceStore.generateApp(text);
  scrollToBottom(true);

  // Reset textarea height
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
}

function handlePromptClick(prompt: string) {
  if (workspaceStore.isStreaming) return;
  promptInput.value = prompt;
  handleSubmit();
}

function handleRefinementClick(suggestion: string) {
  if (workspaceStore.isStreaming) return;
  promptInput.value = suggestion;
  handleSubmit();
}

function handleAbort() {
  workspaceStore.abortCurrentGeneration();
}

function handleNewChat() {
  workspaceStore.clearChat();
}

function handleFileBadgeClick(filename: string) {
  workspaceStore.openTab(filename);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  } else if (e.key === "Escape" && workspaceStore.isStreaming) {
    e.preventDefault();
    handleAbort();
  }
}

function handleRetry(lastPrompt?: string) {
  if (workspaceStore.isStreaming) return;
  if (lastPrompt) {
    promptInput.value = lastPrompt;
    handleSubmit();
  }
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getFileBadgeIcon(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return FileCode;
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts"))
    return Terminal;
  if (lower.endsWith(".css")) return Layers;
  if (lower.endsWith(".json")) return FileJson;
  return FileText;
}

function getFileBadgeColor(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text-amber-500";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts"))
    return "text-yellow-400";
  if (lower.endsWith(".css")) return "text-sky-400";
  if (lower.endsWith(".json")) return "text-emerald-400";
  return "text-slate-400";
}

function formatAssistantContent(content: string): string {
  if (!content) return "";
  const fileDelimiterIdx = content.indexOf("<<<FILE");
  if (fileDelimiterIdx !== -1) {
    return content.substring(0, fileDelimiterIdx).trim();
  }
  return content;
}
</script>

<template>
  <div class="h-full flex flex-col bg-card border-r border-border overflow-hidden select-none">
    <!-- Panel Header -->
    <div class="h-10 px-3 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <MessageSquare class="h-3.5 w-3.5 text-primary shrink-0" />
        <span class="text-xs font-semibold text-foreground tracking-tight truncate">Chat Assistant</span>

        <!-- Live Streaming Status Pill -->
        <div
          v-if="workspaceStore.isStreaming"
          class="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0 animate-pulse"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
          <span>Generating{{ workspaceStore.streamingFilename ? ` ${workspaceStore.streamingFilename}` : '...' }}</span>
        </div>
        <div
          v-else
          class="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          <span>Ready</span>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0 ml-2">
        <!-- Active Model Pill -->
        <span class="font-mono text-[10px] text-muted-foreground bg-background px-2 py-0.5 rounded border border-border truncate max-w-[110px]" :title="settingsStore.model">
          {{ settingsStore.model }}
        </span>

        <button
          type="button"
          @click="handleNewChat"
          class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Start New Chat Session"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
      </div>
    </div>

    <!-- Scrollable Messages Area -->
    <div ref="messagesContainerRef" class="flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-4 select-text min-w-0">
      <slot name="messages">
        <!-- Empty Starter State / Welcome Screen -->
        <div v-if="workspaceStore.messages.length === 0" class="space-y-4 pt-1">
          <div class="p-3.5 rounded-xl bg-primary/5 border border-primary/15 space-y-2">
            <div class="flex items-center gap-2 text-primary font-semibold text-xs">
              <Bot class="h-4 w-4" />
              <span>Genesis AI Generator</span>
            </div>
            <p class="text-xs text-muted-foreground leading-relaxed">
              Describe the HighLevel CRM app or widget you want to build. Genesis will stream multi-file code into Monaco Editor and render it live in preview.
            </p>
          </div>

          <!-- Suggested Quick Prompts -->
          <div class="space-y-2 pt-1">
            <span class="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Sparkles class="h-3 w-3 text-amber-500" />
              <span>Try a Starter Blueprint:</span>
            </span>

            <div class="space-y-2">
              <button
                v-for="(sample, idx) in SAMPLE_PROMPTS"
                :key="idx"
                type="button"
                @click="handlePromptClick(sample.prompt)"
                :disabled="workspaceStore.isStreaming"
                class="w-full text-left p-3 rounded-lg border border-border/70 hover:border-primary/40 bg-card hover:bg-muted/50 transition-all group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div class="flex items-center gap-2">
                  <component :is="sample.icon" class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                  <span class="text-xs font-medium text-foreground group-hover:text-primary">
                    {{ sample.title }}
                  </span>
                </div>
                <p class="text-[11px] text-muted-foreground line-clamp-2 mt-1 pl-5.5 leading-snug">
                  {{ sample.prompt }}
                </p>
              </button>
            </div>
          </div>
        </div>

        <!-- Rendered Message History -->
        <div v-else class="space-y-4">
          <template v-for="msg in workspaceStore.messages" :key="msg.id">
            <!-- User Message Bubble -->
            <div v-if="msg.role === 'user'" class="flex flex-col items-end space-y-1">
              <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground mr-1">
                <User class="h-3 w-3" />
                <span>You</span>
                <span>•</span>
                <span>{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="max-w-[88%] rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-3.5 py-2.5 text-xs shadow-2xs whitespace-pre-wrap break-words leading-relaxed">
                {{ msg.content }}
              </div>
            </div>

            <!-- Assistant Message Card -->
            <div v-else-if="msg.role === 'assistant'" class="flex flex-col items-start space-y-1.5 min-w-0 w-full">
              <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-1">
                <Bot class="h-3.5 w-3.5 text-primary" />
                <span class="font-semibold text-foreground">Genesis AI</span>
                <span>•</span>
                <span>{{ formatTime(msg.timestamp) }}</span>
                <span v-if="msg.status === 'streaming'" class="text-amber-500 font-medium animate-pulse flex items-center gap-1 ml-1">
                  <Loader2 class="h-2.5 w-2.5 animate-spin" />
                  <span>Streaming</span>
                </span>
              </div>

              <div class="w-full min-w-0 rounded-2xl rounded-tl-xs border border-border bg-card p-3.5 text-xs space-y-3 shadow-2xs overflow-hidden">
                <!-- Text / Commentary Content -->
                <div v-if="formatAssistantContent(msg.content)" class="text-foreground leading-relaxed whitespace-pre-wrap break-words min-w-0">
                  <span>{{ formatAssistantContent(msg.content) }}</span>
                  <span
                    v-if="msg.status === 'streaming'"
                    class="inline-block w-1.5 h-3.5 bg-primary animate-pulse ml-0.5 align-middle"
                  ></span>
                </div>
                <div v-else-if="msg.status === 'streaming'" class="flex items-center gap-2 text-muted-foreground italic py-1">
                  <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Architecting HighLevel app solution...</span>
                </div>

                <!-- Generated / Modified Files Badges -->
                <div v-if="msg.filesModified && msg.filesModified.length > 0" class="pt-2 border-t border-border/70 space-y-1.5">
                  <span class="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <FileCode class="h-3 w-3 text-primary" />
                    <span>Generated & Modified Files ({{ msg.filesModified.length }}):</span>
                  </span>

                  <div class="flex flex-wrap gap-1.5 pt-0.5">
                    <button
                      v-for="file in msg.filesModified"
                      :key="file"
                      type="button"
                      @click="handleFileBadgeClick(file)"
                      class="px-2 py-1 rounded-md bg-muted hover:bg-muted/80 border border-border text-[11px] font-mono flex items-center gap-1.5 text-foreground hover:text-primary transition-all cursor-pointer shadow-2xs"
                      title="View file in Monaco Editor"
                    >
                      <component :is="getFileBadgeIcon(file)" :class="['h-3 w-3 shrink-0', getFileBadgeColor(file)]" />
                      <span>{{ file }}</span>
                    </button>
                  </div>
                </div>

                <!-- Aborted Notice -->
                <div
                  v-if="msg.status === 'aborted'"
                  class="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px]"
                >
                  <Square class="h-3 w-3 shrink-0" />
                  <span>Generation stopped by user. Current files preserved in editor.</span>
                </div>

                <!-- Error Notice -->
                <div
                  v-if="msg.status === 'error'"
                  class="space-y-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px]"
                >
                  <div class="flex items-start gap-1.5">
                    <AlertCircle class="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{{ msg.error || 'Failed to complete generation.' }}</span>
                  </div>
                  <div class="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      @click="handleRetry(workspaceStore.messages[workspaceStore.messages.indexOf(msg) - 1]?.content)"
                      class="h-6 text-[10px] px-2 text-destructive hover:bg-destructive/10 cursor-pointer"
                    >
                      Retry Generation
                    </Button>
                  </div>
                </div>

                <!-- Generation Stats Footer -->
                <div
                  v-if="msg.stats"
                  class="pt-1.5 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground font-mono"
                >
                  <div class="flex items-center gap-1">
                    <Zap class="h-3 w-3 text-amber-500" />
                    <span>{{ (msg.stats.durationMs / 1000).toFixed(1) }}s</span>
                  </div>
                  <div>{{ msg.stats.tokenCount.toLocaleString() }} tokens</div>
                  <div>{{ msg.stats.filesCount }} files modified</div>
                </div>
              </div>
            </div>
          </template>

          <!-- Post-Generation Iterative Refinement Suggestions -->
          <div
            v-if="!workspaceStore.isStreaming && workspaceStore.messages.some((m) => m.role === 'assistant' && m.status === 'complete')"
            class="space-y-2 pt-2"
          >
            <span class="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Sparkles class="h-3 w-3 text-amber-500" />
              <span>Suggested Refinements:</span>
            </span>

            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="(sugg, idx) in workspaceStore.refinementSuggestions"
                :key="idx"
                type="button"
                @click="handleRefinementClick(sugg)"
                class="text-left px-2.5 py-1.5 rounded-lg border border-border/80 bg-background hover:bg-muted hover:border-primary/40 text-[11px] text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-2xs"
              >
                + {{ sugg }}
              </button>
            </div>
          </div>
        </div>
      </slot>
    </div>

    <!-- Sticky Prompt Input Area -->
    <div class="p-3 border-t border-border bg-card shrink-0 select-text">
      <slot name="input">
        <form @submit.prevent="handleSubmit" class="space-y-2">
          <div class="relative rounded-lg border border-input bg-background shadow-2xs focus-within:ring-1 focus-within:ring-ring transition-all">
            <textarea
              ref="textareaRef"
              v-model="promptInput"
              @keydown="handleKeydown"
              placeholder="Ask Genesis to build or modify your HighLevel app..."
              rows="3"
              class="w-full resize-none bg-transparent p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            ></textarea>

            <div class="flex items-center justify-between p-2 pt-0">
              <!-- Left Status Hint -->
              <div class="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0 truncate mr-2">
                <span v-if="workspaceStore.isStreaming" class="text-amber-500 flex items-center gap-1 font-medium animate-pulse truncate">
                  <Loader2 class="h-2.5 w-2.5 animate-spin shrink-0" />
                  <span>Esc to stop</span>
                </span>
                <span v-else class="hidden sm:inline-flex items-center gap-0.5 truncate text-[10px]">
                  <span>Enter</span>
                  <CornerDownLeft class="h-2.5 w-2.5 inline shrink-0" />
                  <span>to send · Shift+Enter newline</span>
                </span>
              </div>

              <!-- Right Action Controls -->
              <div class="flex items-center gap-1.5">
                <!-- Stop Generating Button (Active while streaming) -->
                <Button
                  v-if="workspaceStore.isStreaming"
                  type="button"
                  variant="destructive"
                  size="sm"
                  @click="handleAbort"
                  class="h-7 px-2.5 text-xs gap-1.5 shadow-2xs cursor-pointer animate-pulse"
                >
                  <Square class="h-3 w-3 fill-current" />
                  <span>Stop</span>
                </Button>

                <!-- Send / Generate Button (Active when idle) -->
                <Button
                  v-else
                  type="submit"
                  size="sm"
                  :disabled="!promptInput.trim()"
                  class="h-7 px-2.5 text-xs gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send class="h-3 w-3" />
                  <span>Generate</span>
                </Button>
              </div>
            </div>
          </div>
        </form>
      </slot>
    </div>
  </div>
</template>

