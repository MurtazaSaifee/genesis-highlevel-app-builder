<script setup lang="ts">
import { ref, watch } from "vue";
import Dialog from "@/components/ui/Dialog.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import { useProjectsStore } from "@/stores/projects";
import { useHighLevelStore } from "@/stores/highlevel";
import { FolderPlus, Settings2, AlertCircle } from "lucide-vue-next";

interface Props {
  open: boolean;
  mode: "create" | "edit";
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  mode: "create",
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "success", projectId: string): void;
}>();

const projectsStore = useProjectsStore();
const hlStore = useHighLevelStore();

const name = ref("");
const description = ref("");
const locationId = ref("");
const errorMessage = ref<string | null>(null);
const isSubmitting = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      errorMessage.value = null;
      if (props.mode === "edit" && projectsStore.editingProject) {
        name.value = projectsStore.editingProject.name || "";
        description.value = projectsStore.editingProject.description || "";
        locationId.value = projectsStore.editingProject.locationId || "";
      } else {
        name.value = "";
        description.value = "";
        locationId.value = hlStore.locationId || "";
      }
    }
  },
  { immediate: true }
);

async function handleSubmit() {
  const trimmedName = name.value.trim();
  if (!trimmedName) {
    errorMessage.value = "Project name is required.";
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    if (props.mode === "create") {
      const created = await projectsStore.createProject({
        name: trimmedName,
        description: description.value.trim(),
        locationId: locationId.value.trim() || null,
      });

      if (created) {
        emit("success", created.id);
        emit("update:open", false);
      } else {
        errorMessage.value = projectsStore.error || "Failed to create project.";
      }
    } else if (props.mode === "edit" && projectsStore.editingProject) {
      const success = await projectsStore.updateProjectMetadata(
        projectsStore.editingProject.id,
        {
          name: trimmedName,
          description: description.value.trim(),
          locationId: locationId.value.trim() || null,
        }
      );

      if (success) {
        emit("success", projectsStore.editingProject.id);
        emit("update:open", false);
      } else {
        errorMessage.value = projectsStore.error || "Failed to update project.";
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errorMessage.value = msg;
  } finally {
    isSubmitting.value = false;
  }
}

function handleClose() {
  emit("update:open", false);
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="(val) => emit('update:open', val)"
    :title="mode === 'create' ? 'Create New Project' : 'Project Settings'"
    :description="
      mode === 'create'
        ? 'Create an isolated workspace for your HighLevel marketplace app.'
        : 'Update project metadata and connected HighLevel location.'
    "
    max-width="max-w-md"
  >
    <form @submit.prevent="handleSubmit" class="space-y-4 py-1">
      <!-- Error banner -->
      <div
        v-if="errorMessage"
        class="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2"
      >
        <AlertCircle class="h-4 w-4 shrink-0" />
        <span>{{ errorMessage }}</span>
      </div>

      <!-- Project Name -->
      <div class="space-y-1.5">
        <label class="text-xs font-semibold text-foreground flex items-center justify-between">
          <span>Project Name <span class="text-destructive">*</span></span>
        </label>
        <Input
          v-model="name"
          placeholder="e.g. Lead Ingestion Dashboard"
          required
          autofocus
          class="h-9 text-xs"
        />
      </div>

      <!-- Description -->
      <div class="space-y-1.5">
        <label class="text-xs font-semibold text-foreground">
          Description <span class="text-muted-foreground font-normal">(Optional)</span>
        </label>
        <textarea
          v-model="description"
          rows="2"
          placeholder="e.g. Manages recent HighLevel contacts and upcoming appointments"
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-sans"
        ></textarea>
      </div>

      <!-- HighLevel Location Association -->
      <div class="space-y-1.5">
        <label class="text-xs font-semibold text-foreground flex items-center justify-between">
          <span>Connected Location ID</span>
          <span v-if="hlStore.isConnected" class="text-[10px] text-primary font-mono">
            Active: {{ hlStore.locationId }}
          </span>
        </label>
        <Input
          v-model="locationId"
          placeholder="e.g. loc_sandbox_demo_123"
          class="h-9 text-xs font-mono"
        />
        <p class="text-[11px] text-muted-foreground">
          Live CRM API calls will target this HighLevel location ID.
        </p>
      </div>

      <!-- Footer Buttons -->
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="handleClose"
          :disabled="isSubmitting"
          class="text-xs"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="default"
          size="sm"
          :loading="isSubmitting"
          class="text-xs flex items-center gap-1.5"
        >
          <FolderPlus v-if="mode === 'create'" class="h-3.5 w-3.5" />
          <Settings2 v-else class="h-3.5 w-3.5" />
          <span>{{ mode === 'create' ? 'Create Project' : 'Save Changes' }}</span>
        </Button>
      </div>
    </form>
  </Dialog>
</template>
