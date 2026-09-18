<script setup lang="ts">
import { TabsRoot, TabsList, TabsTrigger } from "radix-vue";
import type { Component } from "vue";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon?: Component;
  badge?: string | number;
}

interface Props {
  modelValue: string;
  items: TabItem[];
  class?: string;
  listClass?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();
</script>

<template>
  <TabsRoot
    :model-value="modelValue"
    @update:model-value="(val) => emit('update:modelValue', String(val))"
    :class="cn('w-full', props.class)"
  >
    <TabsList
      :class="
        cn(
          'inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
          props.listClass
        )
      "
    >
      <TabsTrigger
        v-for="item in items"
        :key="item.value"
        :value="item.value"
        class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm cursor-pointer"
      >
        <component :is="item.icon" v-if="item.icon" class="h-3.5 w-3.5" />
        <span>{{ item.label }}</span>
        <span
          v-if="item.badge !== undefined"
          class="ml-1 rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-semibold text-primary"
        >
          {{ item.badge }}
        </span>
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>
