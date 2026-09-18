<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  class?: HTMLAttributes["class"];
  title?: string;
  description?: string;
}

const props = defineProps<Props>();
</script>

<template>
  <div :class="cn('rounded-xl border bg-card text-card-foreground shadow-sm', props.class)">
    <div v-if="title || description || $slots.header" class="flex flex-col space-y-1.5 p-6 pb-4">
      <slot name="header">
        <h3 v-if="title" class="font-semibold leading-none tracking-tight text-xl">{{ title }}</h3>
        <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
      </slot>
    </div>
    <div :class="cn('p-6', (title || description || $slots.header) && 'pt-0')">
      <slot />
    </div>
    <div v-if="$slots.footer" class="flex items-center p-6 pt-0 border-t border-border mt-4">
      <slot name="footer" />
    </div>
  </div>
</template>
