<script setup lang="ts">
import type { HTMLAttributes, InputTypeHTMLAttribute } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  modelValue?: string | number;
  type?: InputTypeHTMLAttribute;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  autocomplete?: string;
  class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "",
  type: "text",
  disabled: false,
  required: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

function onInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit("update:modelValue", target.value);
}
</script>

<template>
  <input
    :id="id"
    :name="name"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :required="required"
    :autocomplete="autocomplete"
    :class="
      cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
    @input="onInput"
  />
</template>
