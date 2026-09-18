<script setup lang="ts">
import { ref, watch } from "vue";
import { useSettingsStore, type LLMProviderPreset, PRESET_DEFAULTS } from "@/stores/settings";
import { useWorkspaceStore } from "@/stores/workspace";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import {
  Key,
  Sparkles,
  Eye,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Shield,
  Trash2,
} from "lucide-vue-next";

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();

// Local form state
const selectedProvider = ref<LLMProviderPreset>(settingsStore.provider);
const apiKeyInput = ref(settingsStore.apiKey);
const baseUrlInput = ref(settingsStore.baseUrl);
const modelInput = ref(settingsStore.model);
const temperatureInput = ref(settingsStore.temperature);
const showKey = ref(false);
const saveSuccess = ref(false);

// Sync local form state when dialog opens
watch(
  () => workspaceStore.isSettingsOpen,
  (isOpen) => {
    if (isOpen) {
      selectedProvider.value = settingsStore.provider;
      apiKeyInput.value = settingsStore.apiKey;
      baseUrlInput.value = settingsStore.baseUrl;
      modelInput.value = settingsStore.model;
      temperatureInput.value = settingsStore.temperature;
      saveSuccess.value = false;
    }
  }
);

function onProviderChange(provider: LLMProviderPreset) {
  selectedProvider.value = provider;
  const preset = PRESET_DEFAULTS[provider];
  baseUrlInput.value = preset.baseUrl;
  modelInput.value = preset.model;
  temperatureInput.value = preset.temperature;
}

function handleSave() {
  settingsStore.updateSettings({
    provider: selectedProvider.value,
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim(),
    model: modelInput.value.trim(),
    temperature: Number(temperatureInput.value),
  });

  saveSuccess.value = true;
  setTimeout(() => {
    saveSuccess.value = false;
    workspaceStore.closeSettings();
  }, 700);
}

function handleReset() {
  settingsStore.resetDefaults();
  selectedProvider.value = settingsStore.provider;
  apiKeyInput.value = settingsStore.apiKey;
  baseUrlInput.value = settingsStore.baseUrl;
  modelInput.value = settingsStore.model;
  temperatureInput.value = settingsStore.temperature;
}

function handleClearKey() {
  apiKeyInput.value = "";
  settingsStore.clearKey();
}
</script>

<template>
  <Dialog
    :open="workspaceStore.isSettingsOpen"
    @update:open="(val) => (val ? workspaceStore.openSettings() : workspaceStore.closeSettings())"
    title="LLM Provider & BYOK Settings"
    description="Configure your LLM API keys and model parameters. Keys are stored safely in local browser storage."
    maxWidth="max-w-md"
  >
    <div class="space-y-4 pt-1 text-xs">
      <!-- Provider Presets -->
      <div class="space-y-1.5">
        <label class="font-medium text-foreground block">Provider Preset</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            type="button"
            @click="onProviderChange('google')"
            :class="[
              'p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1 cursor-pointer',
              selectedProvider === 'google'
                ? 'border-primary bg-primary/10 text-primary font-semibold shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground',
            ]"
          >
            <Sparkles class="h-4 w-4" />
            <span class="text-[11px]">Google Gemini</span>
          </button>

          <button
            type="button"
            @click="onProviderChange('openai')"
            :class="[
              'p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1 cursor-pointer',
              selectedProvider === 'openai'
                ? 'border-primary bg-primary/10 text-primary font-semibold shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground',
            ]"
          >
            <Key class="h-4 w-4" />
            <span class="text-[11px]">OpenAI</span>
          </button>

          <button
            type="button"
            @click="onProviderChange('custom')"
            :class="[
              'p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1 cursor-pointer',
              selectedProvider === 'custom'
                ? 'border-primary bg-primary/10 text-primary font-semibold shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground',
            ]"
          >
            <Shield class="h-4 w-4" />
            <span class="text-[11px]">Custom / Local</span>
          </button>
        </div>
      </div>

      <!-- Free Tier Helper Banner for Google Gemini -->
      <div
        v-if="selectedProvider === 'google'"
        class="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] flex items-start gap-2"
      >
        <Sparkles class="h-4 w-4 shrink-0 mt-0.5" />
        <div class="space-y-0.5">
          <p class="font-medium">Free Tier Recommended</p>
          <p class="text-muted-foreground text-[10px] leading-tight">
            Google AI Studio offers a free Gemini API key with generous RPM.
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              class="underline inline-flex items-center gap-0.5 ml-1 text-primary"
            >
              Get free key <ExternalLink class="h-2.5 w-2.5" />
            </a>
          </p>
        </div>
      </div>

      <!-- API Key Field -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="font-medium text-foreground">API Key (BYOK)</label>
          <span v-if="settingsStore.hasCustomKey" class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            Active in Storage
          </span>
        </div>
        <div class="relative">
          <Input
            :type="showKey ? 'text' : 'password'"
            v-model="apiKeyInput"
            placeholder="AIzaSy... or sk-..."
            class="pr-16 font-mono text-xs"
          />
          <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              @click="showKey = !showKey"
              class="p-1 rounded text-muted-foreground hover:text-foreground"
              title="Toggle visibility"
            >
              <EyeOff v-if="showKey" class="h-3.5 w-3.5" />
              <Eye v-else class="h-3.5 w-3.5" />
            </button>
            <button
              v-if="apiKeyInput"
              type="button"
              @click="handleClearKey"
              class="p-1 rounded text-muted-foreground hover:text-destructive"
              title="Clear key"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p class="text-[10px] text-muted-foreground">
          Leave blank to use the backend server's default configured LLM key.
        </p>
      </div>

      <!-- Base URL -->
      <div class="space-y-1.5">
        <label class="font-medium text-foreground">Base URL (OpenAI-Compatible Endpoint)</label>
        <Input
          type="text"
          v-model="baseUrlInput"
          placeholder="https://..."
          class="font-mono text-xs"
        />
      </div>

      <!-- Model Name -->
      <div class="space-y-1.5">
        <label class="font-medium text-foreground">Model Identifier</label>
        <Input
          type="text"
          v-model="modelInput"
          placeholder="e.g. gemini-2.0-flash, gpt-4o-mini"
          class="font-mono text-xs"
        />
      </div>

      <!-- Temperature Slider -->
      <div class="space-y-1.5">
        <div class="flex justify-between items-center">
          <label class="font-medium text-foreground">Temperature (Creativity vs Determinism)</label>
          <span class="font-mono text-xs text-muted-foreground">{{ temperatureInput }}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          v-model.number="temperatureInput"
          class="w-full accent-primary cursor-pointer"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button
          variant="ghost"
          size="sm"
          @click="handleReset"
          class="gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw class="h-3 w-3" />
          <span>Reset Defaults</span>
        </Button>

        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            @click="workspaceStore.closeSettings"
            class="text-xs"
          >
            Cancel
          </Button>

          <Button
            size="sm"
            @click="handleSave"
            class="gap-1.5 text-xs"
          >
            <CheckCircle2 v-if="saveSuccess" class="h-3.5 w-3.5 text-emerald-400" />
            <span>{{ saveSuccess ? "Saved!" : "Save Settings" }}</span>
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
