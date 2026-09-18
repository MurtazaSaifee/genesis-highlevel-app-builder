<script setup lang="ts">
import { useWorkspaceStore } from "@/stores/workspace";
import ChatPanelShell from "./ChatPanelShell.vue";
import CodeEditorShell from "./CodeEditorShell.vue";
import PreviewPanelShell from "./PreviewPanelShell.vue";

const workspaceStore = useWorkspaceStore();

const emit = defineEmits<{
  (e: "promptSelected", prompt: string): void;
  (e: "refreshPreview"): void;
  (e: "openExternalPreview"): void;
}>();
</script>

<template>
  <div class="flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
    <!-- Desktop Layout (≥1024px) -->
    <div
      class="hidden lg:grid h-full w-full divide-x divide-border"
      :style="{ gridTemplateColumns: workspaceStore.desktopGridStyle }"
    >
      <!-- Chat Panel -->
      <div v-show="workspaceStore.showChat" class="h-full overflow-hidden">
        <ChatPanelShell @promptSelected="(p) => emit('promptSelected', p)">
          <template #messages>
            <slot name="chat-messages" />
          </template>
          <template #input>
            <slot name="chat-input" />
          </template>
        </ChatPanelShell>
      </div>

      <!-- Code Editor Panel -->
      <div v-show="workspaceStore.showCode" class="h-full overflow-hidden">
        <CodeEditorShell>
          <template #editor>
            <slot name="code-editor" />
          </template>
        </CodeEditorShell>
      </div>

      <!-- Live Preview Panel -->
      <div v-show="workspaceStore.showPreview" class="h-full overflow-hidden">
        <PreviewPanelShell
          @refresh="emit('refreshPreview')"
          @openExternal="emit('openExternalPreview')"
        >
          <template #preview>
            <slot name="live-preview" />
          </template>
        </PreviewPanelShell>
      </div>
    </div>

    <!-- Mobile / Tablet Layout (<1024px) -->
    <div class="lg:hidden h-full w-full">
      <!-- Active Tab: Chat -->
      <div v-show="workspaceStore.activePanel === 'chat'" class="h-full w-full">
        <ChatPanelShell @promptSelected="(p) => emit('promptSelected', p)">
          <template #messages>
            <slot name="chat-messages" />
          </template>
          <template #input>
            <slot name="chat-input" />
          </template>
        </ChatPanelShell>
      </div>

      <!-- Active Tab: Code -->
      <div v-show="workspaceStore.activePanel === 'code'" class="h-full w-full">
        <CodeEditorShell>
          <template #editor>
            <slot name="code-editor" />
          </template>
        </CodeEditorShell>
      </div>

      <!-- Active Tab: Preview -->
      <div v-show="workspaceStore.activePanel === 'preview'" class="h-full w-full">
        <PreviewPanelShell
          @refresh="emit('refreshPreview')"
          @openExternal="emit('openExternalPreview')"
        >
          <template #preview>
            <slot name="live-preview" />
          </template>
        </PreviewPanelShell>
      </div>
    </div>
  </div>
</template>
