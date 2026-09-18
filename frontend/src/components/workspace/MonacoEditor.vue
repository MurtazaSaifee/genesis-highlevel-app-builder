<script setup lang="ts">
import { ref, computed, watch, shallowRef, onBeforeUnmount } from "vue";
import { VueMonacoEditor } from "@guolao/vue-monaco-editor";
import type * as monacoEditor from "monaco-editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { Loader2 } from "lucide-vue-next";

const workspaceStore = useWorkspaceStore();

// ARCHITECTURE DECISION: shallowRef prevents Vue 3 from deeply proxying Monaco's heavy internal AST and event listeners
const editorInstance = shallowRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
const monacoInstance = shallowRef<typeof monacoEditor | null>(null);
let cursorDisposable: monacoEditor.IDisposable | null = null;
const isReady = ref(false);

const activeCode = computed({
  get() {
    return workspaceStore.files[workspaceStore.activeFilename] ?? "";
  },
  set(newVal: string) {
    if (!workspaceStore.isStreaming) {
      workspaceStore.setFileContent(workspaceStore.activeFilename, newVal);
    }
  },
});

const editorOptions = computed(() => ({
  automaticLayout: true,
  readOnly: workspaceStore.isStreaming,
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  tabSize: 2,
  fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
  renderWhitespace: "selection" as const,
  padding: { top: 8, bottom: 8 },
  smoothScrolling: true,
  cursorBlinking: "smooth" as const,
  contextmenu: true,
}));

function handleMount(editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: typeof monacoEditor) {
  editorInstance.value = editor;
  monacoInstance.value = monaco;
  isReady.value = true;

  // Track cursor movements for footer status bar with proper disposal management
  cursorDisposable?.dispose();
  cursorDisposable = editor.onDidChangeCursorPosition((e) => {
    if (e?.position) {
      workspaceStore.setEditorCursor(e.position.lineNumber, e.position.column);
    }
  });
}

onBeforeUnmount(() => {
  cursorDisposable?.dispose();
  cursorDisposable = null;
});

function handleChange(val: string | undefined) {
  if (val !== undefined && !workspaceStore.isStreaming) {
    workspaceStore.setFileContent(workspaceStore.activeFilename, val);
  }
}

// Auto-scroll to latest token when streaming into the active file
watch(
  () => workspaceStore.files[workspaceStore.activeFilename],
  () => {
    if (workspaceStore.isStreaming && editorInstance.value) {
      try {
        const model = editorInstance.value.getModel();
        if (model) {
          const lineCount = model.getLineCount();
          editorInstance.value.revealLine(lineCount);
        }
      } catch {
        // Safe guard against disposed models
      }
    }
  }
);
</script>

<template>
  <div class="h-full w-full relative overflow-hidden bg-[#1e1e1e]">
    <!-- Monaco Editor Instance -->
    <VueMonacoEditor
      v-model:value="activeCode"
      :language="workspaceStore.activeLanguage"
      :path="workspaceStore.activeFilename"
      theme="vs-dark"
      :options="editorOptions"
      :save-view-state="true"
      @mount="handleMount"
      @change="handleChange"
      class="h-full w-full"
    >
      <template #loading>
        <div class="h-full w-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground/60 select-none bg-[#1e1e1e]">
          <Loader2 class="h-8 w-8 text-primary animate-spin mb-3" />
          <p class="font-mono text-xs text-muted-foreground">Initializing Monaco Editor...</p>
          <span class="mt-2 text-[11px] text-muted-foreground/40 font-mono">
            Loading {{ workspaceStore.activeFilename }} ({{ workspaceStore.activeLanguage }})
          </span>
        </div>
      </template>
    </VueMonacoEditor>

    <!-- Streaming overlay indicator in top right -->
    <div
      v-if="workspaceStore.isStreaming"
      class="absolute top-2 right-4 z-10 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-mono flex items-center gap-1.5 shadow-sm backdrop-blur-xs select-none"
    >
      <Loader2 class="h-3 w-3 animate-spin text-amber-400" />
      <span>Streaming (Read-Only)</span>
    </div>
  </div>
</template>
