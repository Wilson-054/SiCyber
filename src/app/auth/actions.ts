
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";
import {
  PW_RESET_COOKIE,
  PW_RESET_WINDOW_SECONDS,
  isPlausibleCode,
  isPlausibleEmail,
  isResetCookieValid,
  makeResetCookieValue,
  normalizeCode,
  normalizeEmail,
  validateNewPassword,
  validatePasswordLength,
} from "@/../utils/auth-rules";

const GENERIC_CODE_ERROR =
  "Kode salah atau sudah kedaluwarsa. Periksa kembali atau minta kode baru.";

function failTo(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "");

  if (!email || !password) {
    redirect("/signup?error=Email dan password wajib diisi");
  }
  const passwordProblem = validatePasswordLength(password);
  if (passwordProblem) {
    failTo("/signup", passwordProblem);
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }, 
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

export async function requestPasswordReset(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));

  if (!isPlausibleEmail(email)) {
    failTo("/forgot-password", "Masukkan alamat email yang valid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    console.error("[password-reset] gagal meminta kode:", error.code ?? error.message);
  }

  redirect(`/reset-password?email=${encodeURIComponent(email)}&sent=1`);
}

export async function verifyResetCode(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  const code = normalizeCode(formData.get("code"));
  const back = `/reset-password?email=${encodeURIComponent(email)}`;

  if (!isPlausibleEmail(email) || !isPlausibleCode(code)) {
    failTo(back, GENERIC_CODE_ERROR);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "recovery",
  });

  if (error || !data.user) {
    if (error?.status === 429) {
      failTo(back, "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.");
    }
    failTo(back, GENERIC_CODE_ERROR);
  }

  const cookieStore = await cookies();
  cookieStore.set(PW_RESET_COOKIE, makeResetCookieValue(data.user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PW_RESET_WINDOW_SECONDS,
  });

  redirect("/new-password");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  if (!user) {
    failTo("/forgot-password", "Sesi reset password berakhir. Minta kode baru.");
  }
  if (!isResetCookieValid(cookieStore.get(PW_RESET_COOKIE)?.value, user.id)) {
    redirect("/materi");
  }

  const problem = validateNewPassword(password, confirm);
  if (problem) {
    failTo("/new-password", problem);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[password-reset] gagal mengganti password:", error.code ?? error.message);
    if (error.code === "same_password") {
      failTo("/new-password", "Password baru tidak boleh sama dengan password lama.");
    }
    if (error.code === "weak_password") {
      failTo("/new-password", "Password terlalu lemah. Gunakan kombinasi yang lebih kuat.");
    }
    failTo("/new-password", "Gagal mengganti password. Coba lagi.");
  }

  cookieStore.delete(PW_RESET_COOKIE);
  await supabase.auth.signOut({ scope: "others" });

  revalidatePath("/", "layout");
  redirect("/materi");
}