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

export const useWorkspaceStore = defineStore("workspace", () => {
  // Mobile/Tablet active panel
  const activePanel = ref<WorkspacePanel>("chat");

  // Desktop panel visibility toggles
  const showChat = ref<boolean>(true);
  const showCode = ref<boolean>(true);
  const showPreview = ref<boolean>(true);

  // Preview device emulation mode
  const previewDevice = ref<PreviewDevice>("desktop");

  // Active file for editor
  const activeFilename = ref<string>("index.html");
  const openFiles = ref<string[]>([...DEFAULT_FILES]);

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

  function togglePanel(panel: WorkspacePanel) {
    if (panel === "chat") {
      // Don't allow closing all panels
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
    activeFilename.value = name;
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
    activeFilename,
    openFiles,
    isSettingsOpen,
    isConnectModalOpen,
    visibleDesktopPanelCount,
    desktopGridStyle,
    togglePanel,
    setAllPanelsVisible,
    setActivePanel,
    setPreviewDevice,
    setActiveFilename,
    openSettings,
    closeSettings,
    openConnectModal,
    closeConnectModal,
  };
});
