// Save as: utils/certifications.ts
//
// Helper bersama, dipanggil dari DUA titik penyelesaian:
//   - app/materi/actions.ts          -> markMaterialComplete
//   - app/actions/exercise-progress.ts -> recordAttempt (saat success)
// Bukan Server Action sendiri ("use server" tidak diperlukan) -- ini murni
// util yang jalan di server, dipanggil dari dalam Server Action lain yang
// sudah punya instance `supabase` (server client milik user yang login).
//
// CATATAN KEAMANAN (sesuai kesepakatan): pengecekan kelulusan & penerbitan
// sertifikat dilakukan di APLIKASI, bukan di trigger database. Ini cukup
// untuk kebutuhan skripsi; kalau nanti perlu diperkuat, logic ini bisa
// dipindah balik ke trigger security-definer tanpa mengubah struktur tabel.

import { createClient } from "@/../utils/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AwardedCertification = {
  code: string;
  title: string;
  type: "subtopic" | "category";
};

export async function checkAndAwardCertifications(
  supabase: SupabaseServerClient,
  userId: string,
  categoryId: string,
  subtopicId: string | null
): Promise<AwardedCertification[]> {
  const awarded: AwardedCertification[] = [];

  if (subtopicId) {
    const subtopicDone = await isSubtopicComplete(supabase, userId, subtopicId);
    if (subtopicDone) {
      awarded.push(
        ...(await issueCertifications(supabase, userId, "subtopic", { subtopic_id: subtopicId }))
      );
    }
  }

  const categoryDone = await isCategoryComplete(supabase, userId, categoryId);
  if (categoryDone) {
    awarded.push(
      ...(await issueCertifications(supabase, userId, "category", { category_id: categoryId }))
    );
  }

  return awarded;
}

async function issueCertifications(
  supabase: SupabaseServerClient,
  userId: string,
  type: "subtopic" | "category",
  match: { subtopic_id: string } | { category_id: string }
): Promise<AwardedCertification[]> {
  const { data: certs } = await supabase
    .from("certifications")
    .select("id, code, title")
    .eq("type", type)
    .match(match);

  const awarded: AwardedCertification[] = [];

  for (const cert of certs ?? []) {
    const { data: existing } = await supabase
      .from("user_certifications")
      .select("id")
      .eq("user_id", userId)
      .eq("certification_id", cert.id)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase
      .from("user_certifications")
      .insert({ user_id: userId, certification_id: cert.id });

    if (!error) {
      awarded.push({ code: cert.code, title: cert.title, type });
    }
  }

  return awarded;
}

async function isSubtopicComplete(
  supabase: SupabaseServerClient,
  userId: string,
  subtopicId: string
): Promise<boolean> {
  const { data: materials } = await supabase
    .from("materials")
    .select("id")
    .eq("subtopic_id", subtopicId);
  const { data: exercises } = await supabase
    .from("exercises")
    .select("id")
    .eq("subtopic_id", subtopicId);

  const materialIds = (materials ?? []).map((m) => m.id);
  const exerciseIds = (exercises ?? []).map((e) => e.id);

  if (materialIds.length === 0 && exerciseIds.length === 0) return false;

  let materialsDone = true;
  if (materialIds.length > 0) {
    const { data: progress } = await supabase
      .from("user_progress")
      .select("material_id")
      .eq("user_id", userId)
      .eq("material_completed", true)
      .in("material_id", materialIds);
    materialsDone = (progress?.length ?? 0) === materialIds.length;
  }

  let exercisesDone = true;
  if (exerciseIds.length > 0) {
    const { data: progress } = await supabase
      .from("user_progress")
      .select("exercise_id")
      .eq("user_id", userId)
      .eq("exercise_status", "completed")
      .in("exercise_id", exerciseIds);
    exercisesDone = (progress?.length ?? 0) === exerciseIds.length;
  }

  return materialsDone && exercisesDone;
}

async function isCategoryComplete(
  supabase: SupabaseServerClient,
  userId: string,
  categoryId: string
): Promise<boolean> {
  const { data: subtopics } = await supabase
    .from("subtopics")
    .select("id")
    .eq("category_id", categoryId);

  const subtopicIds = (subtopics ?? []).map((s) => s.id);
  if (subtopicIds.length === 0) return false; // belum ada subtopic terdefinisi

  const { data: certs } = await supabase
    .from("certifications")
    .select("id")
    .eq("type", "subtopic")
    .in("subtopic_id", subtopicIds);

  const certIds = (certs ?? []).map((c) => c.id);
  // Belum semua subtopic punya sertifikat terdefinisi -> kategori belum bisa lulus
  if (certIds.length !== subtopicIds.length) return false;

  const { data: owned } = await supabase
    .from("user_certifications")
    .select("certification_id")
    .eq("user_id", userId)
    .in("certification_id", certIds);

  return (owned?.length ?? 0) === certIds.length;
}