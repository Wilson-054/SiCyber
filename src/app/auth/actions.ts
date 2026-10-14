// Save as: app/auth/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";

function failSignup(message: string): never {
  redirect(`/signup?error=${encodeURIComponent(message)}`);
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const username = String(formData.get("username") ?? "").trim();

  if (!email || !password) {
    failSignup("Email dan password wajib diisi");
  }
  if (password.length < 6) {
    failSignup("Password minimal 6 karakter");
  }
  if (password !== confirmPassword) {
    failSignup("Password dan konfirmasi password tidak sama");
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }, 
    },
  });

  if (error) {
    failSignup(error.message);
  }

  revalidatePath("/", "layout");
  redirect("/materi");
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/materi");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}