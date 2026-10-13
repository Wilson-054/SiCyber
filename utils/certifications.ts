// Save as: utils/certifications.ts
//
// Helper bersama, dipanggil dari SATU titik penyelesaian:
//   - app/actions/exercise-progress.ts -> recordAttempt (saat success, dan
//     hanya saat transisi ke 'completed' yang PERTAMA KALI)
//
// TIDAK ADA TABEL SERTIFIKAT. Semua di file ini murni "derived": dihitung
// ulang dari user_progress + exercises + categories setiap kali dibutuhkan.
// Tidak ada insert/write di sini sama sekali.
//
// Dua level sertifikat:
//   - "exercise" : exercise tertentu baru saja completed pertama kali
//   - "category" : SELURUH exercise dalam satu category_id sudah completed
//                  (materi / material_completed TIDAK dihitung di sini)

import { createClient } from "@/../utils/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AwardedCertification = {
  code: string;
  title: string;
  type: "exercise" | "category";
};

export type UserCertificate = AwardedCertification & {
  issued_at: string;
};

/**
 * Dipanggil TEPAT SAAT sebuah exercise baru saja bertransisi ke status
 * "completed" untuk PERTAMA KALINYA. Caller (recordAttempt) yang menjamin
 * ini lewat pengecekan !alreadyCompleted -- fungsi ini tidak mengecek ulang,
 * jadi jangan panggil di luar konteks itu.
 */
export async function checkAndAwardCertifications(
  supabase: SupabaseServerClient,
  userId: string,
  categoryId: string,
  exerciseId: string
): Promise<AwardedCertification[]> {
  const awarded: AwardedCertification[] = [];

  const { data: exercise } = await supabase
    .from("exercises")
    .select("slug, title")
    .eq("id", exerciseId)
    .single();

  if (exercise) {
    awarded.push({ code: exercise.slug, title: exercise.title, type: "exercise" });
  }

  if (await isCategoryComplete(supabase, userId, categoryId)) {
    const { data: category } = await supabase
      .from("categories")
      .select("code, name")
      .eq("id", categoryId)
      .single();

    if (category) {
      awarded.push({ code: category.code, title: category.name, type: "category" });
    }
  }

  return awarded;
}

async function isCategoryComplete(
  supabase: SupabaseServerClient,
  userId: string,
  categoryId: string
): Promise<boolean> {
  const { data: exercises } = await supabase
    .from("exercises")
    .select("id")
    .eq("category_id", categoryId);

  const exerciseIds = (exercises ?? []).map((e) => e.id);
  if (exerciseIds.length === 0) return false; // belum ada exercise -> belum bisa lulus

  const { data: completed } = await supabase
    .from("user_progress")
    .select("exercise_id")
    .eq("user_id", userId)
    .eq("exercise_status", "completed")
    .in("exercise_id", exerciseIds);

  return (completed?.length ?? 0) === exerciseIds.length;
}

/**
 * Dipakai oleh halaman /sertifikat untuk menampilkan SEMUA sertifikat yang
 * "dipegang" user saat ini. Dihitung ulang penuh setiap render (full
 * derived) -- tidak masalah untuk skala skripsi (jumlah kategori & exercise
 * kecil). Kalau nanti data membesar, ini kandidat pertama untuk di-cache
 * atau dipindah ke satu view/RPC di Postgres.
 */
export async function getUserCertificates(
  supabase: SupabaseServerClient,
  userId: string
): Promise<UserCertificate[]> {
  const certs: UserCertificate[] = [];

  // --- Sertifikat exercise ---
  const { data: completedRows } = await supabase
    .from("user_progress")
    .select("completed_at, exercises(slug, title)")
    .eq("user_id", userId)
    .eq("exercise_status", "completed")
    .not("exercise_id", "is", null);

  type ExerciseRow = {
    completed_at: string | null;
    exercises: { slug: string; title: string } | null;
  };

  for (const row of (completedRows ?? []) as unknown as ExerciseRow[]) {
    if (!row.exercises || !row.completed_at) continue;
    certs.push({
      code: row.exercises.slug,
      title: row.exercises.title,
      type: "exercise",
      issued_at: row.completed_at,
    });
  }

  // --- Sertifikat kategori ---
  const { data: categories } = await supabase.from("categories").select("id, code, name");

  for (const category of categories ?? []) {
    const { data: exercises } = await supabase
      .from("exercises")
      .select("id")
      .eq("category_id", category.id);

    const exerciseIds = (exercises ?? []).map((e) => e.id);
    if (exerciseIds.length === 0) continue;

    const { data: progress } = await supabase
      .from("user_progress")
      .select("completed_at")
      .eq("user_id", userId)
      .eq("exercise_status", "completed")
      .in("exercise_id", exerciseIds);

    if ((progress?.length ?? 0) !== exerciseIds.length) continue;

    const issuedAt = (progress ?? [])
      .map((p) => p.completed_at)
      .filter((d): d is string => !!d)
      .sort()
      .pop();

    certs.push({
      code: category.code,
      title: category.name,
      type: "category",
      issued_at: issuedAt ?? new Date().toISOString(),
    });
  }

  certs.sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));

  return certs;
}