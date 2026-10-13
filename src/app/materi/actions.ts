// Save as: app/materi/actions.ts (replaces existing file)
"use server";

import { createClient } from "@/../utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { AwardedCertification } from "@/app/components/Materi/CertificateAwardedModal";

export async function markMaterialComplete(
  materialId: string,
  categoryId: string,
  categoryCode: string
): Promise<{ newCertifications: AwardedCertification[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Kamu harus login untuk menyimpan progres.");
  }

  // prerequisite_material_id di sini murni metadata urutan yang disarankan
  // (lihat diskusi: lock materi sengaja tidak ditegakkan di platform ini),
  // jadi pengecekan ini cuma untuk pesan error yang ramah kalau frontend
  // lain nanti mencoba menegakkannya -- bukan pengaman utama.
  const { data: material } = await supabase
    .from("materials")
    .select("prerequisite_material_id")
    .eq("id", materialId)
    .single();

  if (material?.prerequisite_material_id) {
    const { data: prereqProgress } = await supabase
      .from("user_progress")
      .select("material_completed")
      .eq("user_id", user.id)
      .eq("material_id", material.prerequisite_material_id)
      .maybeSingle();

    if (!prereqProgress?.material_completed) {
      throw new Error(
        "Selesaikan materi sebelumnya terlebih dahulu sebelum lanjut ke materi ini."
      );
    }
  }

  const { error } = await supabase.from("user_progress").upsert(
    {
      user_id: user.id,
      category_id: categoryId,
      material_id: materialId,
      material_completed: true,
      material_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,material_id" }
  );

  if (error) {
    throw new Error(`Gagal menyimpan progres: ${error.message}`);
  }

  revalidatePath(`/materi/${categoryCode}`);

  // Materi TIDAK memicu sertifikat -- sertifikat hanya dari exercise
  // (lihat utils/certifications.ts). Field ini dipertahankan di return type
  // supaya MarkCompleteButton.tsx tidak perlu diubah kontraknya.
  return { newCertifications: [] };
}

type RecommendedCategory = { id: string; code: string; name: string } | null;

export async function getNextRecommendedCategoryAction(
  currentCategoryId: string
): Promise<RecommendedCategory> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, code, name, order_index")
    .order("order_index", { ascending: true });

  if (!categories) return null;

  const { data: onboarding } = await supabase
    .from("user_onboarding_result")
    .select("category_scores")
    .eq("user_id", user.id)
    .maybeSingle();

  const scores: { category: { id: string }; score: number }[] =
    onboarding?.category_scores ?? [];
  const scoreMap = new Map(scores.map((s) => [s.category.id, s.score]));

  // --- materi ---
  const { data: materials } = await supabase
    .from("materials")
    .select("id, category_id");

  const { data: materialProgress } = await supabase
    .from("user_progress")
    .select("material_id")
    .eq("user_id", user.id)
    .eq("material_completed", true);

  const completedMaterialIds = new Set(
    (materialProgress ?? []).map((p) => p.material_id)
  );

  const materialsByCategory = new Map<string, string[]>();
  for (const m of materials ?? []) {
    const list = materialsByCategory.get(m.category_id) ?? [];
    list.push(m.id);
    materialsByCategory.set(m.category_id, list);
  }

  // --- exercise ---
  const { data: exercises } = await supabase
    .from("exercises")
    .select("id, category_id");

  const { data: exerciseProgress } = await supabase
    .from("user_progress")
    .select("exercise_id")
    .eq("user_id", user.id)
    .eq("exercise_status", "completed");

  const completedExerciseIds = new Set(
    (exerciseProgress ?? []).map((p) => p.exercise_id)
  );

  const exercisesByCategory = new Map<string, string[]>();
  for (const e of exercises ?? []) {
    const list = exercisesByCategory.get(e.category_id) ?? [];
    list.push(e.id);
    exercisesByCategory.set(e.category_id, list);
  }

  const isCategoryFullyCompleted = (categoryId: string) => {
    const materialIds = materialsByCategory.get(categoryId) ?? [];
    const exerciseIds = exercisesByCategory.get(categoryId) ?? [];

    const allMaterialsDone =
      materialIds.length === 0 ||
      materialIds.every((id) => completedMaterialIds.has(id));
    const allExercisesDone =
      exerciseIds.length === 0 ||
      exerciseIds.every((id) => completedExerciseIds.has(id));

    const hasAnyContent = materialIds.length > 0 || exerciseIds.length > 0;
    return hasAnyContent && allMaterialsDone && allExercisesDone;
  };

  const candidates = categories
    .filter((c) => c.id !== currentCategoryId && !isCategoryFullyCompleted(c.id))
    .map((c) => ({ category: c, score: scoreMap.get(c.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.category ?? null;
}