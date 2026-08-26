// Save as: app/auth/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "");

  if (!email || !password) {
    redirect("/signup?error=Email dan password wajib diisi");
  }
  if (password.length < 6) {
    redirect("/signup?error=Password minimal 6 karakter");
  }

  // No emailRedirectTo here — email confirmation is turned OFF in the
  // Supabase dashboard (Authentication > Providers > Email), so this
  // immediately creates a confirmed, logged-in user.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }, // read by handle_new_user() trigger
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
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