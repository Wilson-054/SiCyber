
"use server";

import { createClient } from "@/../utils/supabase/server";
import { revalidatePath } from "next/cache";

type Result = { ok: true; username: string } | { ok: false; error: string };

export async function updateUsername(rawName: string): Promise<Result> {
  const username = rawName.trim().replace(/\s+/g, " ");

  if (username.length < 3 || username.length > 50) {
    return { ok: false, error: "Nama harus 3-50 karakter." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Kamu harus login." };

  const { error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Nama ini sudah dipakai pengguna lain." };
    }
    return { ok: false, error: `Gagal menyimpan: ${error.message}` };
  }

  revalidatePath("/sertifikat");
  revalidatePath("/materi");
  return { ok: true, username };
}