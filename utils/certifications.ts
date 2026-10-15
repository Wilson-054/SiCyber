// Save as: utils/certifications.ts (MENGGANTIKAN versi lama)
//
// TIDAK ADA TABEL SERTIFIKAT. Semua murni "derived" dari quiz_results.
//
// Aturan:
//   - HANYA sertifikat KATEGORI.
//   - Didapat HANYA setelah lulus post-test kategori itu (skor >= 80%).
//   - Tanggal terbit = submitted_at percobaan lulus PERTAMA.
//   - Menyelesaikan exercise TIDAK memberi sertifikat apa pun.
//
// checkAndAwardCertifications dihapus. Kalau ada file lain yang masih
// mengimpornya, tsc akan menunjukkannya; hapus pemanggilnya.

import { createClient } from "@/../utils/supabase/server";
import { isPassing, POSTTEST_KIND } from "@/../utils/Quiz/posttest";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Union "exercise" | "category" sengaja dipertahankan supaya
// CertificateAwardedModal (yang belum dilihat) tetap lolos tsc. Tidak ada
// kode yang lagi membuat nilai bertipe "exercise". Persempit ke "category"
// setelah modal itu dibersihkan.
export type AwardedCertification = {
  code: string;
  title: string;
  type: "exercise" | "category";
};

export type UserCertificate = {
  code: string;
  title: string;
  type: "category";
  issued_at: string;
};

type Category = { code: string; name: string };
type ResultRow = {
  score: number | null;
  total: number | null;
  submitted_at: string | null;
  // Tergantung bentuk relasi, PostgREST bisa mengembalikan objek atau array.
  categories: Category | Category[] | null;
};

/**
 * Semua sertifikat yang dipegang user saat ini. Dihitung ulang setiap
 * render dari satu query ke quiz_results.
 */
export async function getUserCertificates(
  supabase: SupabaseServerClient,
  userId: string
): Promise<UserCertificate[]> {
  const { data, error } = await supabase
    .from("quiz_results")
    .select("score, total, submitted_at, categories(code, name)")
    .eq("user_id", userId)
    .eq("kind", POSTTEST_KIND)
    .not("submitted_at", "is", null)
    .not("score", "is", null)
    .order("submitted_at", { ascending: true });

  if (error) {
    console.error("[getUserCertificates] select quiz_results gagal", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  const byCategory = new Map<string, UserCertificate>();

  // Urutan ascending: percobaan lulus pertama per kategori yang menang.
  for (const row of (data ?? []) as unknown as ResultRow[]) {
    if (row.score == null || row.total == null || !row.submitted_at) continue;
    if (!isPassing(row.score, row.total)) continue;

    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    if (!category) continue;
    if (byCategory.has(category.code)) continue;

    byCategory.set(category.code, {
      code: category.code,
      title: category.name,
      type: "category",
      issued_at: row.submitted_at,
    });
  }

  return [...byCategory.values()].sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));
}