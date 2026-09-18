import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type WorkspacePanel = "chat" | "code" | "preview";
export type PreviewDevice = "desktop" | "tablet" | "mobile";

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

  function setFileContent(filename: string, content: string) {
    files.value[filename] = content;
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
  };
});
