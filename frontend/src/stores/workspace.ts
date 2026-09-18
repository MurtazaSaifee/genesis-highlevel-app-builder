import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useSettingsStore } from "./settings.ts";
import { useProjectsStore } from "./projects.ts";
import type { SaveStatus } from "../types/project.ts";
import {
  streamGenerateApp,
  type StreamController,
} from "../lib/sseClient.ts";

export type WorkspacePanel = "chat" | "code" | "preview";
export type PreviewDevice = "desktop" | "tablet" | "mobile";

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "complete" | "aborted" | "error";

export interface GenerationStats {
  durationMs: number;
  tokenCount: number;
  filesCount: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  status?: MessageStatus;
  filesModified?: string[];
  stats?: GenerationStats;
  error?: string;
}

export const DEFAULT_REFINEMENT_SUGGESTIONS: string[] = [
  "Add a search bar to filter records live",
  "Add an 'Export to CSV' download button",
  "Add form validation and inline error alerts",
  "Improve responsive layout for mobile screens",
  "Add dark mode theme styling",
];

export const DEVICE_WIDTHS: Record<PreviewDevice, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

export const DEFAULT_FILES = ["index.html", "app.js", "style.css"];

export const STARTER_FILES: Record<string, string> = {
  "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HighLevel Marketplace App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="style.css">
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen p-6 font-sans">
  <div id="app" class="max-w-4xl mx-auto space-y-6">
    <header class="border-b pb-4 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-800">HighLevel Genesis App</h1>
        <p class="text-sm text-slate-500">Live CRM preview connected to HighLevel APIs</p>
      </div>
      <button id="btn-load" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm cursor-pointer">
        Fetch CRM Data
      </button>
    </header>
    
    <main id="content" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Recent Contacts</h2>
        <div id="contacts-list" class="space-y-2 text-sm text-slate-600">
          <p class="italic text-slate-400">Click "Fetch CRM Data" to load contacts.</p>
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Appointments</h2>
        <div id="appointments-list" class="space-y-2 text-sm text-slate-600">
          <p class="italic text-slate-400">Click "Fetch CRM Data" to load appointments.</p>
        </div>
      </div>
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
  "app.js": `// HighLevel Client Integration
// Communicates with window.highlevel injected runtime client

document.addEventListener("DOMContentLoaded", () => {
  const fetchBtn = document.getElementById("btn-load");
  const contactsList = document.getElementById("contacts-list");
  const appointmentsList = document.getElementById("appointments-list");

  async function loadData() {
    if (!window.highlevel) {
      contactsList.innerHTML = '<p class="text-amber-600">HighLevel runtime proxy not ready.</p>';
      return;
    }

    try {
      contactsList.innerHTML = '<p class="text-slate-400 animate-pulse">Loading contacts...</p>';
      appointmentsList.innerHTML = '<p class="text-slate-400 animate-pulse">Loading appointments...</p>';

      const contactsRes = await window.highlevel.contacts.list({ limit: 5 });
      const contacts = contactsRes.contacts || [];

      if (contacts.length === 0) {
        contactsList.innerHTML = '<p class="text-slate-400">No contacts found in location.</p>';
      } else {
        contactsList.innerHTML = contacts.map(c => \`
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
            <div>
              <p class="font-medium text-slate-800">\${c.contactName || (c.firstName ? c.firstName + ' ' + (c.lastName || '') : 'Unnamed Contact')}</p>
              <p class="text-xs text-slate-400">\${c.email || c.phone || 'No contact info'}</p>
            </div>
            <span class="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Contact</span>
          </div>
        \`).join('');
      }

      const apptRes = await window.highlevel.calendars.getAppointments({ limit: 5 });
      const appointments = apptRes.appointments || apptRes.events || [];

      if (appointments.length === 0) {
        appointmentsList.innerHTML = '<p class="text-slate-400">No appointments scheduled.</p>';
      } else {
        appointmentsList.innerHTML = appointments.map(a => \`
          <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
            <div>
              <p class="font-medium text-slate-800">\${a.title || a.appointmentStatus || 'Appointment'}</p>
              <p class="text-xs text-slate-400">\${a.startTime ? new Date(a.startTime).toLocaleString() : 'No date'}</p>
            </div>
            <span class="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">\${a.status || 'Confirmed'}</span>
          </div>
        \`).join('');
      }
    } catch (err) {
      console.error("Error fetching HighLevel data:", err);
      contactsList.innerHTML = \`<p class="text-red-500">Error: \${err.message || 'Failed to load'}</p>\`;
    }
  }

  if (fetchBtn) {
    fetchBtn.addEventListener("click", loadData);
  }
});`,
  "style.css": `/* Custom App Styles */
body {
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

#app {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}`,
};

export function getLanguageByFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  return "plaintext";
}

export const useWorkspaceStore = defineStore("workspace", () => {
  // Mobile/Tablet active panel
  const activePanel = ref<WorkspacePanel>("chat");

  // Desktop panel visibility toggles
  const showChat = ref<boolean>(true);
  const showCode = ref<boolean>(true);
  const showPreview = ref<boolean>(true);

  // Preview device emulation mode
  const previewDevice = ref<PreviewDevice>("desktop");

  // File tree visibility in center panel
  const isFileTreeOpen = ref<boolean>(true);

  // File state & multi-file content
  const files = ref<Record<string, string>>({ ...STARTER_FILES });
  const activeFilename = ref<string>("index.html");
  const openFiles = ref<string[]>([...DEFAULT_FILES]);

  // Streaming & read-only lock state
  const isStreaming = ref<boolean>(false);
  const streamingFilename = ref<string | null>(null);

  // Editor cursor tracking (Ln, Col)
  const cursorPosition = ref<{ line: number; col: number }>({ line: 1, col: 1 });

  // Dialog visibility states
  const isSettingsOpen = ref<boolean>(false);
  const isConnectModalOpen = ref<boolean>(false);

  // Chat messaging & streaming controller state
  const messages = ref<ChatMessage[]>([]);
  const refinementSuggestions = ref<string[]>([...DEFAULT_REFINEMENT_SUGGESTIONS]);
  const activeStreamController = ref<StreamController | null>(null);
  const activeStreamingMessageId = ref<string | null>(null);
  // Preview live reload counter
  const previewReloadKey = ref<number>(0);

  // Project file persistence & save status
  const saveStatus = ref<SaveStatus>("saved");
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // Number of visible desktop panels
  const visibleDesktopPanelCount = computed(() => {
    let count = 0;
    if (showChat.value) count++;
    if (showCode.value) count++;
    if (showPreview.value) count++;
    return count;
  });

  // Dynamic CSS grid template columns for desktop
  const desktopGridStyle = computed(() => {
    const panels: string[] = [];
    if (showChat.value) panels.push("minmax(300px, 340px)");
    if (showCode.value) panels.push("minmax(380px, 1fr)");
    if (showPreview.value) panels.push("minmax(340px, 1fr)");

    if (panels.length === 0) return "1fr";
    return panels.join(" ");
  });

  // Active file language
  const activeLanguage = computed(() => {
    return getLanguageByFilename(activeFilename.value);
  });

  // Active file content
  const activeFileContent = computed(() => {
    return files.value[activeFilename.value] ?? "";
  });

  // List of all filenames in project
  const allFilenames = computed(() => {
    return Object.keys(files.value);
  });

  function togglePanel(panel: WorkspacePanel) {
    if (panel === "chat") {
      if (showChat.value && visibleDesktopPanelCount.value === 1) return;
      showChat.value = !showChat.value;
    } else if (panel === "code") {
      if (showCode.value && visibleDesktopPanelCount.value === 1) return;
      showCode.value = !showCode.value;
    } else if (panel === "preview") {
      if (showPreview.value && visibleDesktopPanelCount.value === 1) return;
      showPreview.value = !showPreview.value;
    }
  }

  function setAllPanelsVisible() {
    showChat.value = true;
    showCode.value = true;
    showPreview.value = true;
  }

  function setActivePanel(panel: WorkspacePanel) {
    activePanel.value = panel;
  }

  function setPreviewDevice(device: PreviewDevice) {
    previewDevice.value = device;
  }

  function setActiveFilename(name: string) {
    if (files.value[name] !== undefined) {
      activeFilename.value = name;
      if (!openFiles.value.includes(name)) {
        openFiles.value.push(name);
      }
    }
  }

  function openTab(filename: string) {
    setActiveFilename(filename);
  }

  function closeTab(filename: string) {
    if (openFiles.value.length <= 1) return; // Keep at least one tab open

    const index = openFiles.value.indexOf(filename);
    if (index !== -1) {
      openFiles.value.splice(index, 1);
      if (activeFilename.value === filename) {
        // Switch to adjacent tab
        const nextIndex = Math.max(0, index - 1);
        activeFilename.value = openFiles.value[nextIndex];
      }
    }
  }

  function setFileContent(filename: string, content: string, fromUserEdit = true) {
    files.value[filename] = content;
    if (fromUserEdit && !isStreaming.value) {
      saveStatus.value = "unsaved";
      scheduleAutoSave();
    }
  }

  function scheduleAutoSave() {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    autoSaveTimer = setTimeout(() => {
      forceSaveNow();
    }, 1000);
  }

  async function forceSaveNow(): Promise<boolean> {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }

    try {
      const projectsStore = useProjectsStore();
      if (!projectsStore.activeProjectId) {
        saveStatus.value = "saved";
        return true;
      }

      saveStatus.value = "saving";
      const success = await projectsStore.saveProjectFiles(
        projectsStore.activeProjectId,
        { ...files.value },
        activeFilename.value
      );

      if (success) {
        saveStatus.value = "saved";
        return true;
      } else {
        saveStatus.value = "error";
        return false;
      }
    } catch (err) {
      console.warn("[WorkspaceStore] File save skipped or failed:", err);
      saveStatus.value = "error";
      return false;
    }
  }

  function loadProjectFiles(newFiles: Record<string, string>, targetActiveFilename?: string) {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    files.value = { ...newFiles };
    const filenames = Object.keys(newFiles);
    openFiles.value = filenames.length > 0 ? [...filenames] : [...DEFAULT_FILES];
    if (targetActiveFilename && newFiles[targetActiveFilename] !== undefined) {
      activeFilename.value = targetActiveFilename;
    } else if (newFiles["index.html"] !== undefined) {
      activeFilename.value = "index.html";
    } else if (filenames.length > 0) {
      activeFilename.value = filenames[0];
    }
    saveStatus.value = "saved";
    triggerPreviewReload();
  }

  function appendToFileContent(filename: string, chunk: string) {
    if (files.value[filename] === undefined) {
      files.value[filename] = "";
      if (!openFiles.value.includes(filename)) {
        openFiles.value.push(filename);
      }
    }
    files.value[filename] += chunk;
  }

  function createFile(filename: string, initialContent = ""): boolean {
    // CONCURRENCY & STREAMING MUTEX GUARD: Block file mutations during LLM streaming
    if (isStreaming.value) return false;

    const trimmed = filename.trim();
    if (!trimmed || files.value[trimmed] !== undefined) {
      return false;
    }
    files.value[trimmed] = initialContent;
    if (!openFiles.value.includes(trimmed)) {
      openFiles.value.push(trimmed);
    }
    activeFilename.value = trimmed;
    forceSaveNow();
    return true;
  }

  function deleteFile(filename: string): boolean {
    // CONCURRENCY & STREAMING MUTEX GUARD: Block file mutations during LLM streaming
    if (isStreaming.value) return false;

    if (files.value[filename] === undefined) return false;
    // Don't allow deleting all files
    if (Object.keys(files.value).length <= 1) return false;

    delete files.value[filename];
    closeTab(filename);

    if (activeFilename.value === filename) {
      const remaining = Object.keys(files.value);
      if (remaining.length > 0) {
        activeFilename.value = remaining[0];
      }
    }
    forceSaveNow();
    return true;
  }

  function toggleFileTree() {
    isFileTreeOpen.value = !isFileTreeOpen.value;
  }

  function setStreamingState(streaming: boolean, filename?: string | null) {
    isStreaming.value = streaming;
    streamingFilename.value = streaming ? (filename ?? null) : null;
  }

  function setEditorCursor(line: number, col: number) {
    cursorPosition.value = { line, col };
  }

  function openSettings() {
    isSettingsOpen.value = true;
  }

  function closeSettings() {
    isSettingsOpen.value = false;
  }

  function openConnectModal() {
    isConnectModalOpen.value = true;
  }

  function closeConnectModal() {
    isConnectModalOpen.value = false;
  }

  function addMessage(msg: Partial<ChatMessage> & { role: MessageRole; content: string }): ChatMessage {
    const newMsg: ChatMessage = {
      id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      status: msg.status || "complete",
      filesModified: msg.filesModified ? [...msg.filesModified] : [],
      stats: msg.stats,
      error: msg.error,
    };
    messages.value.push(newMsg);
    return newMsg;
  }

  function clearChat() {
    if (isStreaming.value) {
      abortCurrentGeneration();
    }
    messages.value = [];
    activeStreamingMessageId.value = null;
    refinementSuggestions.value = [...DEFAULT_REFINEMENT_SUGGESTIONS];
  }

  function abortCurrentGeneration() {
    if (activeStreamController.value) {
      activeStreamController.value.abort();
      activeStreamController.value = null;
    }
    setStreamingState(false, null);

    if (activeStreamingMessageId.value) {
      const target = messages.value.find((m) => m.id === activeStreamingMessageId.value);
      if (target && target.status === "streaming") {
        target.status = "aborted";
        if (!target.content) {
          target.content = "Generation cancelled by user.";
        }
      }
      activeStreamingMessageId.value = null;
    }
  }

  function updateRefinementSuggestions(lastPrompt: string, filesModified: string[]) {
    const lowerPrompt = lastPrompt.toLowerCase();
    const suggestions: string[] = [];

    if (lowerPrompt.includes("contact") || lowerPrompt.includes("lead")) {
      suggestions.push("Add live search filter for contact names and emails");
      suggestions.push("Add an 'Export to CSV' button for contacts");
      suggestions.push("Add tag management pills to contact cards");
    } else if (lowerPrompt.includes("calendar") || lowerPrompt.includes("appoint")) {
      suggestions.push("Add a calendar date range filter");
      suggestions.push("Add appointment status badges (Confirmed/Cancelled)");
      suggestions.push("Add appointment booking confirmation modal");
    } else if (lowerPrompt.includes("conversation") || lowerPrompt.includes("message")) {
      suggestions.push("Add quick reply preset message buttons");
      suggestions.push("Add automatic message refresh interval");
      suggestions.push("Add conversation channel filter (SMS vs Email)");
    }

    if (filesModified.some((f) => f.endsWith(".css"))) {
      suggestions.push("Customize color palette with HighLevel brand theme");
    }
    if (filesModified.some((f) => f.endsWith(".js") || f.endsWith(".ts"))) {
      suggestions.push("Add debounced input search and loading spinners");
    }

    // General suggestions
    suggestions.push("Add form validation with error toast alerts");
    suggestions.push("Optimize layout for mobile preview screens");
    suggestions.push("Add dark mode toggle styling");

    refinementSuggestions.value = Array.from(new Set(suggestions)).slice(0, 5);
  }

  function triggerPreviewReload() {
    previewReloadKey.value++;
  }

  function generateApp(
    promptText: string,
    options?: {
      byok?: { apiKey?: string; baseURL?: string; model?: string };
      baseUrl?: string;
      projectId?: string;
      getIdToken?: () => Promise<string | null>;
      streamClientFn?: typeof streamGenerateApp;
    }
  ): StreamController | null {
    const trimmed = promptText.trim();
    if (!trimmed || isStreaming.value) {
      return null;
    }

    // 1. Create and append User message
    const userMsgId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      status: "complete",
    };
    messages.value.push(userMsg);

    // 2. Create and append Assistant streaming placeholder message
    const assistantMsgId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      status: "streaming",
      filesModified: [],
    };
    messages.value.push(assistantMsg);
    activeStreamingMessageId.value = assistantMsgId;

    // 3. Compile multi-turn conversation history (prior completed turns)
    const conversationHistory = messages.value
      .filter(
        (m) =>
          m.id !== assistantMsgId &&
          m.id !== userMsgId &&
          (m.status === "complete" || m.status === "aborted")
      )
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // 4. Resolve BYOK settings
    let resolvedByok = options?.byok;
    if (!resolvedByok) {
      try {
        const settingsStore = useSettingsStore();
        if (settingsStore.apiKey) {
          resolvedByok = {
            apiKey: settingsStore.apiKey,
            baseURL: settingsStore.baseUrl,
            model: settingsStore.model,
          };
        }
      } catch {
        // Standalone test environment
      }
    }

    // 5. Mutex & Streaming State
    setStreamingState(true, null);

    let activeProjectId = options?.projectId;
    if (!activeProjectId) {
      try {
        const projectsStore = useProjectsStore();
        if (projectsStore.activeProjectId) {
          activeProjectId = projectsStore.activeProjectId;
        }
      } catch {
        // Standalone test environment
      }
    }

    const streamFn = options?.streamClientFn || streamGenerateApp;
    const startTime = Date.now();

    try {
      const controller = streamFn({
        prompt: trimmed,
        projectId: activeProjectId,
        existingFiles: { ...files.value },
        conversationHistory,
        byok: resolvedByok,
        baseUrl: options?.baseUrl,
        getIdToken: options?.getIdToken,
        callbacks: {
          onStart: (_evt) => {
            const target = messages.value.find((m) => m.id === assistantMsgId);
            if (target) {
              target.status = "streaming";
            }
          },
          onToken: (evt) => {
            const target = messages.value.find((m) => m.id === assistantMsgId);
            if (target) {
              target.content += evt.chunk;
            }
          },
          onFileStart: (evt) => {
            setStreamingState(true, evt.filename);
            if (files.value[evt.filename] === undefined) {
              files.value[evt.filename] = "";
            }
            if (!openFiles.value.includes(evt.filename)) {
              openFiles.value.push(evt.filename);
            }
            activeFilename.value = evt.filename;

            const target = messages.value.find((m) => m.id === assistantMsgId);
            if (target) {
              if (!target.filesModified) target.filesModified = [];
              if (!target.filesModified.includes(evt.filename)) {
                target.filesModified.push(evt.filename);
              }
            }
          },
          onFileContent: (evt) => {
            appendToFileContent(evt.filename, evt.chunk);
          },
          onFileEnd: (evt) => {
            setFileContent(evt.filename, evt.fullContent, false);
            const target = messages.value.find((m) => m.id === assistantMsgId);
            if (target) {
              if (!target.filesModified) target.filesModified = [];
              if (!target.filesModified.includes(evt.filename)) {
                target.filesModified.push(evt.filename);
              }
            }
          },
          onDone: (evt) => {
            const durationMs = Date.now() - startTime;
            const target = messages.value.find((m) => m.id === assistantMsgId);
            if (target) {
              target.status = "complete";
              if (evt.conversationText && !target.content) {
                target.content = evt.conversationText;
              }
              if (evt.files) {
                for (const [fn, content] of Object.entries(evt.files)) {
                  setFileContent(fn, content, false);
                  if (!target.filesModified?.includes(fn)) {
                    target.filesModified?.push(fn);
                  }
                }
              }
              target.stats = {
                durationMs: evt.stats?.durationMs || durationMs,
                tokenCount: evt.stats?.tokenCount || 0,
                filesCount: evt.stats?.filesCount || (target.filesModified?.length || 0),
              };
            }

            updateRefinementSuggestions(trimmed, target?.filesModified || []);

            setStreamingState(false, null);
            activeStreamController.value = null;
            activeStreamingMessageId.value = null;
            triggerPreviewReload();
            forceSaveNow();
          },
          onError: (evt) => {
            const target = messages.value.find((m) => m.id === assistantMsgId);
            if (target) {
              if (evt.code === "REQUEST_ABORTED") {
                target.status = "aborted";
                if (!target.content) {
                  target.content = "Generation cancelled by user.";
                }
              } else {
                target.status = "error";
                target.error = evt.message || "An error occurred during generation.";
              }
            }
            setStreamingState(false, null);
            activeStreamController.value = null;
            activeStreamingMessageId.value = null;
          },
        },
      });

      if (isStreaming.value) {
        activeStreamController.value = controller;
      } else {
        activeStreamController.value = null;
      }
      return controller;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const target = messages.value.find((m) => m.id === assistantMsgId);
      if (target) {
        target.status = "error";
        target.error = errorMsg || "Failed to initiate generation.";
      }
      setStreamingState(false, null);
      activeStreamController.value = null;
      activeStreamingMessageId.value = null;
      return null;
    }
  }

  return {
    activePanel,
    showChat,
    showCode,
    showPreview,
    previewDevice,
    isFileTreeOpen,
    files,
    activeFilename,
    openFiles,
    isStreaming,
    streamingFilename,
    cursorPosition,
    isSettingsOpen,
    isConnectModalOpen,
    messages,
    refinementSuggestions,
    activeStreamController,
    activeStreamingMessageId,
    visibleDesktopPanelCount,
    desktopGridStyle,
    activeLanguage,
    activeFileContent,
    allFilenames,
    togglePanel,
    setAllPanelsVisible,
    setActivePanel,
    setPreviewDevice,
    setActiveFilename,
    openTab,
    closeTab,
    setFileContent,
    appendToFileContent,
    createFile,
    deleteFile,
    toggleFileTree,
    setStreamingState,
    setEditorCursor,
    openSettings,
    closeSettings,
    openConnectModal,
    closeConnectModal,
    addMessage,
    clearChat,
    abortCurrentGeneration,
    updateRefinementSuggestions,
    generateApp,
    saveStatus,
    loadProjectFiles,
    forceSaveNow,
    scheduleAutoSave,
    previewReloadKey,
    triggerPreviewReload,
  };
});
