<script setup lang="ts">
import { useSettingsStore } from "@/stores/settings";
import Button from "@/components/ui/Button.vue";
import {
  MessageSquare,
  Sparkles,
  Send,
  RotateCcw,
  Bot,
  UserCheck,
  Calendar,
} from "lucide-vue-next";

const settingsStore = useSettingsStore();

const emit = defineEmits<{
  (e: "promptSelected", promptText: string): void;
}>();

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

function handlePromptClick(prompt: string) {
  emit("promptSelected", prompt);
}
</script>

<template>
  <div class="h-full flex flex-col bg-card border-r border-border overflow-hidden">
    <!-- Panel Header -->
    <div class="h-10 px-3 border-b border-border flex items-center justify-between bg-muted/40 shrink-0">
      <div class="flex items-center gap-2">
        <MessageSquare class="h-3.5 w-3.5 text-primary" />
        <span class="text-xs font-semibold text-foreground tracking-tight">Chat Assistant</span>
      </div>

      <div class="flex items-center gap-1.5">
        <!-- Active Model Pill -->
        <span class="font-mono text-[10px] text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">
          {{ settingsStore.model }}
        </span>

        <button
          type="button"
          class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="New Chat Session"
        >
          <RotateCcw class="h-3 w-3" />
        </button>
      </div>
    </div>

    <!-- Scrollable Messages Area -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <slot name="messages">
        <!-- Default Starter State / Welcome Screen -->
        <div class="space-y-4 pt-2">
          <div class="p-3.5 rounded-xl bg-primary/5 border border-primary/15 space-y-2">
            <div class="flex items-center gap-2 text-primary font-semibold text-xs">
              <Bot class="h-4 w-4" />
              <span>Genesis AI Generator</span>
            </div>
            <p class="text-xs text-muted-foreground leading-relaxed">
              Describe the HighLevel CRM app or widget you want to build. Genesis will stream multi-file code into Monaco Editor and render it live.
            </p>
          </div>

          <!-- Suggested Quick Prompts -->
          <div class="space-y-2 pt-1">
            <span class="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Sparkles class="h-3 w-3 text-amber-500" />
              <span>Try a Starter Blueprint:</span>
            </span>

            <div class="space-y-1.5">
              <button
                v-for="(sample, idx) in SAMPLE_PROMPTS"
                :key="idx"
                type="button"
                @click="handlePromptClick(sample.prompt)"
                class="w-full text-left p-2.5 rounded-lg border border-border/70 hover:border-primary/40 bg-card hover:bg-muted/50 transition-all group cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <component :is="sample.icon" class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                  <span class="text-xs font-medium text-foreground group-hover:text-primary">
                    {{ sample.title }}
                  </span>
                </div>
                <p class="text-[11px] text-muted-foreground line-clamp-2 mt-1 pl-5.5">
                  {{ sample.prompt }}
                </p>
              </button>
            </div>
          </div>
        </div>
      </slot>
    </div>

    <!-- Sticky Prompt Input Area -->
    <div class="p-3 border-t border-border bg-card shrink-0">
      <slot name="input">
        <form @submit.prevent class="space-y-2">
          <div class="relative rounded-lg border border-input bg-background shadow-xs focus-within:ring-1 focus-within:ring-ring">
            <textarea
              placeholder="Ask Genesis to generate or modify your HighLevel app..."
              rows="3"
              class="w-full resize-none bg-transparent p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            ></textarea>

            <div class="flex items-center justify-between p-2 pt-0">
              <span class="text-[10px] text-muted-foreground">
                Task 10 Streaming UI
              </span>

              <Button size="sm" class="h-7 px-2.5 text-xs gap-1.5">
                <Send class="h-3 w-3" />
                <span>Send</span>
              </Button>
            </div>
          </div>
        </form>
      </slot>
    </div>
  </div>
</template>
