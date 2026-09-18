<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "radix-vue";
import { X } from "lucide-vue-next";
import { cn } from "@/lib/utils";

interface Props {
  open?: boolean;
  title?: string;
  description?: string;
  maxWidth?: string;
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  maxWidth: "max-w-lg",
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();
</script>

<template>
  <DialogRoot :open="open" @update:open="(val) => emit('update:open', val)">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogContent
        :class="
          cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl',
            props.maxWidth
          )
        "
      >
        <div v-if="title || description || $slots.header" class="flex flex-col space-y-1.5 text-left">
          <slot name="header">
            <DialogTitle v-if="title" class="text-base font-semibold leading-none tracking-tight text-foreground">
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" class="text-xs text-muted-foreground mt-1">
              {{ description }}
            </DialogDescription>
          </slot>
        </div>

        <slot />

        <div v-if="$slots.footer" class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-2 border-t border-border">
          <slot name="footer" />
        </div>

        <DialogClose
          class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none p-1 text-muted-foreground hover:text-foreground"
        >
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
