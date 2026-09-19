import { defineStore } from "pinia";
import { ref, computed } from "vue";

export type LLMProviderPreset = "google" | "openai" | "custom";

export interface BYOKSettings {
  provider: LLMProviderPreset;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

export const PRESET_DEFAULTS: Record<LLMProviderPreset, Omit<BYOKSettings, "provider" | "apiKey">> = {
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-3.1-flash-lite",
    temperature: 0.7,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.7,
  },
  custom: {
    baseUrl: "http://localhost:11434/v1",
    model: "llama3",
    temperature: 0.7,
  },
};

const STORAGE_KEY = "genesis_byok_settings";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && globalThis.localStorage && typeof globalThis.localStorage.getItem === "function") {
    return globalThis.localStorage as Storage;
  }
  return null;
}

function loadInitialSettings(): BYOKSettings {
  const fallback: BYOKSettings = {
    provider: "google",
    apiKey: "",
    baseUrl: PRESET_DEFAULTS.google.baseUrl,
    model: PRESET_DEFAULTS.google.model,
    temperature: PRESET_DEFAULTS.google.temperature,
  };

  const storage = getStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      provider: parsed.provider || fallback.provider,
      apiKey: parsed.apiKey || "",
      baseUrl: parsed.baseUrl || fallback.baseUrl,
      model: parsed.model || fallback.model,
      temperature: typeof parsed.temperature === "number" ? parsed.temperature : fallback.temperature,
    };
  } catch (err) {
    console.warn("Failed to load BYOK settings from localStorage:", err);
    return fallback;
  }
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = loadInitialSettings();

  const provider = ref<LLMProviderPreset>(initial.provider);
  const apiKey = ref<string>(initial.apiKey);
  const baseUrl = ref<string>(initial.baseUrl);
  const model = ref<string>(initial.model);
  const temperature = ref<number>(initial.temperature);

  const hasCustomKey = computed(() => !!apiKey.value.trim());

  function saveToStorage() {
    const storage = getStorage();
    if (!storage) return;
    try {
      const payload: BYOKSettings = {
        provider: provider.value,
        apiKey: apiKey.value.trim(),
        baseUrl: baseUrl.value.trim(),
        model: model.value.trim(),
        temperature: temperature.value,
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error("Failed to save BYOK settings to localStorage:", err);
    }
  }

  function applyPreset(selectedProvider: LLMProviderPreset) {
    provider.value = selectedProvider;
    const preset = PRESET_DEFAULTS[selectedProvider];
    baseUrl.value = preset.baseUrl;
    model.value = preset.model;
    temperature.value = preset.temperature;
    saveToStorage();
  }

  function updateSettings(patch: Partial<BYOKSettings>) {
    if (patch.provider !== undefined) provider.value = patch.provider;
    if (patch.apiKey !== undefined) apiKey.value = patch.apiKey;
    if (patch.baseUrl !== undefined) baseUrl.value = patch.baseUrl;
    if (patch.model !== undefined) model.value = patch.model;
    if (patch.temperature !== undefined) temperature.value = patch.temperature;
    saveToStorage();
  }

  function resetDefaults() {
    provider.value = "google";
    apiKey.value = "";
    baseUrl.value = PRESET_DEFAULTS.google.baseUrl;
    model.value = PRESET_DEFAULTS.google.model;
    temperature.value = PRESET_DEFAULTS.google.temperature;
    saveToStorage();
  }

  function clearKey() {
    apiKey.value = "";
    saveToStorage();
  }

  const byokPayload = computed(() => {
    if (!apiKey.value.trim()) return undefined;
    return {
      apiKey: apiKey.value.trim(),
      baseUrl: baseUrl.value.trim() || undefined,
      model: model.value.trim() || undefined,
    };
  });

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    temperature,
    hasCustomKey,
    byokPayload,
    applyPreset,
    updateSettings,
    resetDefaults,
    clearKey,
  };
});
