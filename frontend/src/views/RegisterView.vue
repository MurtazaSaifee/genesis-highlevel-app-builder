<script setup lang="ts">
import { ref } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import Card from "@/components/ui/Card.vue";
import { AlertCircle, Sparkles, CheckCircle2 } from "lucide-vue-next";

const router = useRouter();
const authStore = useAuthStore();

const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const formError = ref<string | null>(null);

function validateForm(): boolean {
  formError.value = null;
  authStore.clearError();

  const trimmedEmail = email.value.trim();
  if (!trimmedEmail) {
    formError.value = "Please enter your email address.";
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    formError.value = "Please enter a valid email address.";
    return false;
  }

  if (!password.value) {
    formError.value = "Please enter a password.";
    return false;
  }

  if (password.value.length < 6) {
    formError.value = "Password must be at least 6 characters long.";
    return false;
  }

  if (password.value !== confirmPassword.value) {
    formError.value = "Passwords do not match. Please re-enter.";
    return false;
  }

  return true;
}

async function handleRegister() {
  if (!validateForm()) return;

  try {
    await authStore.signUp(email.value, password.value);
    router.push("/");
  } catch {
    // Error is set in authStore.error
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4 bg-muted/20">
    <div class="w-full max-w-md space-y-6">
      <!-- App Header Branding -->
      <div class="text-center space-y-2">
        <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <Sparkles class="h-6 w-6" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-foreground">Create your Genesis Account</h1>
        <p class="text-sm text-muted-foreground">Start building AI-powered HighLevel applications</p>
      </div>

      <!-- Sign Up Card -->
      <Card>
        <!-- Error Banner -->
        <div
          v-if="formError || authStore.error"
          class="mb-4 rounded-lg bg-destructive/15 border border-destructive/20 p-3 flex items-start gap-2.5 text-destructive text-sm"
          role="alert"
        >
          <AlertCircle class="h-4 w-4 mt-0.5 shrink-0" />
          <span>{{ formError || authStore.error }}</span>
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div class="space-y-1.5">
            <label for="reg-email" class="text-xs font-medium text-foreground">
              Email Address
            </label>
            <Input
              id="reg-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              v-model="email"
              autocomplete="email"
              required
            />
          </div>

          <div class="space-y-1.5">
            <label for="reg-password" class="text-xs font-medium text-foreground">
              Password
            </label>
            <Input
              id="reg-password"
              name="password"
              type="password"
              placeholder="At least 6 characters"
              v-model="password"
              autocomplete="new-password"
              required
            />
          </div>

          <div class="space-y-1.5">
            <label for="reg-confirm-password" class="text-xs font-medium text-foreground">
              Confirm Password
            </label>
            <Input
              id="reg-confirm-password"
              name="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              v-model="confirmPassword"
              autocomplete="new-password"
              required
            />
          </div>

          <Button
            type="submit"
            class="w-full"
            :loading="authStore.loading"
          >
            Create Account
          </Button>
        </form>

        <div class="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?
          <RouterLink
            to="/login"
            class="font-medium text-primary hover:underline ml-1"
          >
            Sign in
          </RouterLink>
        </div>
      </Card>

      <!-- Emulator Helper Tip -->
      <div class="rounded-lg border border-border bg-card/60 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
        <CheckCircle2 class="h-4 w-4 text-emerald-500 shrink-0" />
        <span>Firebase Emulator active: No external verification email required.</span>
      </div>
    </div>
  </div>
</template>
