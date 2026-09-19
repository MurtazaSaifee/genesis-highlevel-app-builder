<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import {
  FileCode,
  Terminal,
  Layers,
  FileJson,
  FileText,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  FolderClosed,
} from "lucide-vue-next";

const workspaceStore = useWorkspaceStore();

const isCreatingFile = ref(false);
const newFilename = ref("");
const createError = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

function getFileIcon(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return FileCode;
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts"))
    return Terminal;
  if (lower.endsWith(".css")) return Layers;
  if (lower.endsWith(".json")) return FileJson;
  return FileText;
}

function getFileIconColor(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text-amber-500";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts"))
    return "text-yellow-400";
  if (lower.endsWith(".css")) return "text-sky-400";
  if (lower.endsWith(".json")) return "text-emerald-400";
  return "text-slate-400";
}

function getLineCount(filename: string): number {
  const content = workspaceStore.files[filename];
  if (!content) return 1;
  return content.split("\n").length;
}

async function startCreatingFile() {
  if (workspaceStore.isStreaming) return;
  isCreatingFile.value = true;
  newFilename.value = "";
  createError.value = "";
  await nextTick();
  inputRef.value?.focus();
}

function cancelCreatingFile() {
  isCreatingFile.value = false;
  newFilename.value = "";
  createError.value = "";
}

function submitNewFile() {
  if (workspaceStore.isStreaming) {
    createError.value = "Cannot create files while generation is streaming";
    return;
  }
  const name = newFilename.value.trim();
  if (!name) {
    createError.value = "Filename cannot be empty";
    return;
  }
  if (workspaceStore.files[name] !== undefined) {
    createError.value = "File already exists";
    return;
  }

  // Create starter template depending on extension
  let initial = "";
  if (name.endsWith(".html")) {
    initial = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${name}</title>\n</head>\n<body>\n  <div id="app"></div>\n</body>\n</html>`;
  } else if (name.endsWith(".js") || name.endsWith(".ts")) {
    initial = `// ${name}\nconsole.log("${name} loaded");\n`;
  } else if (name.endsWith(".css")) {
    initial = `/* ${name} */\n`;
  } else if (name.endsWith(".json")) {
    initial = `{\n  \n}\n`;
  }

  const success = workspaceStore.createFile(name, initial);
  if (success) {
    isCreatingFile.value = false;
    newFilename.value = "";
    createError.value = "";
  } else {
    createError.value = "Failed to create file";
  }
}

function handleDelete(filename: string, event: MouseEvent) {
  event.stopPropagation();
  if (workspaceStore.isStreaming) return;
  const isLast = workspaceStore.allFilenames.length <= 1;
  const message = isLast
    ? `Delete "${filename}"? This will leave the project with no files.`
    : `Delete "${filename}"? This action cannot be undone.`;
  const confirmed = window.confirm(message);
  if (confirmed) {
    workspaceStore.deleteFile(filename);
  }
}

function handleSelectFile(filename: string) {
  workspaceStore.openTab(filename);
}

const fileList = computed(() => workspaceStore.allFilenames);
</script>

<template>
  <div class="h-full w-full flex flex-col bg-muted/20 border-r border-border text-xs select-none">
    <!-- File Tree Header -->
    <div class="h-9 px-3 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
      <div class="flex items-center gap-1.5 font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
        <FolderClosed class="h-3.5 w-3.5 text-primary" />
        <span>Explorer</span>
        <span class="ml-1 px-1.5 py-0.2 rounded-full bg-muted text-[10px] font-normal text-muted-foreground">
          {{ fileList.length }}
        </span>
      </div>

      <div class="flex items-center gap-1">
        <button
          type="button"
          @click="startCreatingFile"
          :disabled="workspaceStore.isStreaming"
          :class="[
            'h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer',
            workspaceStore.isStreaming ? 'opacity-40 cursor-not-allowed' : '',
          ]"
          :title="workspaceStore.isStreaming ? 'File creation disabled during streaming' : 'New File'"
        >
          <Plus class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Inline New File Form -->
    <div v-if="isCreatingFile" class="p-2 border-b border-border bg-muted/30">
      <div class="flex items-center gap-1">
        <input
          ref="inputRef"
          v-model="newFilename"
          type="text"
          placeholder="filename.js"
          @keydown.enter="submitNewFile"
          @keydown.esc="cancelCreatingFile"
          class="flex-1 h-6 px-1.5 text-xs font-mono bg-background border border-primary/50 rounded focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
        />
        <button
          type="button"
          @click="submitNewFile"
          class="h-6 w-6 rounded bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center cursor-pointer"
          title="Create"
        >
          <Check class="h-3 w-3" />
        </button>
        <button
          type="button"
          @click="cancelCreatingFile"
          class="h-6 w-6 rounded hover:bg-muted text-muted-foreground flex items-center justify-center cursor-pointer"
          title="Cancel"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
      <p v-if="createError" class="mt-1 text-[10px] text-destructive">{{ createError }}</p>
    </div>

    <!-- File Tree List Items -->
    <div class="flex-1 overflow-y-auto py-1 px-1.5 space-y-0.5 font-mono">
      <div
        v-for="filename in fileList"
        :key="filename"
        @click="handleSelectFile(filename)"
        :class="[
          'group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors',
          workspaceStore.activeFilename === filename
            ? 'bg-accent/80 text-accent-foreground font-medium shadow-2xs'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        ]"
      >
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <component
            :is="getFileIcon(filename)"
            :class="['h-3.5 w-3.5 shrink-0', getFileIconColor(filename)]"
          />
          <span class="truncate text-[11px]">{{ filename }}</span>

          <!-- Active Streaming Indicator Badge -->
          <span
            v-if="workspaceStore.isStreaming && workspaceStore.streamingFilename === filename"
            class="flex items-center gap-1 text-[10px] text-amber-500 font-sans font-normal ml-auto shrink-0"
            title="Streaming in progress"
          >
            <Loader2 class="h-2.5 w-2.5 animate-spin text-amber-500" />
            <span class="text-[9px]">live</span>
          </span>
        </div>

        <div class="flex items-center gap-1 shrink-0 ml-2">
          <!-- Line count indicator (hidden on hover if delete available) -->
          <span
            class="text-[10px] text-muted-foreground/60 font-sans group-hover:hidden"
          >
            {{ getLineCount(filename) }}L
          </span>

          <!-- Delete file button (shown on hover, disabled if streaming) -->
          <button
            v-if="!workspaceStore.isStreaming"
            type="button"
            @click="handleDelete(filename, $event)"
            class="hidden group-hover:flex h-5 w-5 rounded items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            :title="`Delete ${filename}`"
          >
            <Trash2 class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
