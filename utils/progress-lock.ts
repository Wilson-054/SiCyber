// Save as: utils/progress-lock.ts (MENGGANTIKAN versi lama)
//
// Aturan lock (satu-satunya sumber kebenaran):
//   Dalam satu kategori, materi + exercise digabung dan diurutkan berdasarkan
//   order_index. Item di posisi N terbuka kalau SEMUA item di posisi sebelumnya
//   sudah selesai. Item yang sudah selesai selalu tetap bisa dibuka lagi.
//
// Kalau order_index kembar antara materi dan exercise, urutannya: materi dulu,
// baru exercise, lalu id sebagai penentu terakhir (supaya hasilnya stabil).
//
// prerequisite_material_id TIDAK dipakai sama sekali.
//
// POST-TEST (baru): bukan bagian dari `sequence`. Ia SELALU item terakhir di
// kategori dan terbuka kalau semua item di `sequence` sudah selesai. Disimpan
// terpisah di `state.posttest` supaya kode lama yang membaca
// `sequence[sequence.length - 1]` (mis. isLastExercise) tidak berubah arti.
// "Selesai" = ada minimal satu baris quiz_results (kind 'posttest') dengan
// skor >= 80%.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPassing, POSTTEST_KIND } from "./Quiz/posttest";

export type SequenceItemType = "material" | "exercise";

export type SequenceItem = {
  type: SequenceItemType;
  id: string;
  order_index: number;
};

export type PosttestState = {
  /** Kategori ini punya soal post-test. */
  available: boolean;
  /** User pernah lulus (skor >= 80%). Selalu false bila belum login. */
  passed: boolean;
};

export type CategorySequenceState = {
  sequence: SequenceItem[];
  completedKeys: Set<string>;
  unlockedKeys: Set<string>;
  posttest: PosttestState & { unlocked: boolean };
};

export const LOCKED_MESSAGE =
  "Item ini masih terkunci. Selesaikan item sebelumnya terlebih dahulu.";

export function itemKey(type: SequenceItemType, id: string): string {
  return `${type}-${id}`;
}

export function buildSequence(
  materials: { id: string; order_index: number }[],
  exercises: { id: string; order_index: number }[]
): SequenceItem[] {
  const items: SequenceItem[] = [
    ...materials.map((m) => ({
      type: "material" as const,
      id: m.id,
      order_index: m.order_index,
    })),
    ...exercises.map((e) => ({
      type: "exercise" as const,
      id: e.id,
      order_index: e.order_index,
    })),
  ];

  return items.sort((a, b) => {
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    if (a.type !== b.type) return a.type === "material" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function computeUnlockedKeys(
  sequence: SequenceItem[],
  completedKeys: Set<string>
): Set<string> {
  const unlocked = new Set<string>();
  let allPreviousDone = true;

  for (const item of sequence) {
    const key = itemKey(item.type, item.id);
    const done = completedKeys.has(key);

    if (allPreviousDone || done) unlocked.add(key);
    if (!done) allPreviousDone = false;
  }

  return unlocked;
}

/** True bila semua item di sequence sudah selesai (syarat membuka post-test). */
export function isSequenceComplete(
  sequence: SequenceItem[],
  completedKeys: Set<string>
): boolean {
  return sequence.every((it) => completedKeys.has(itemKey(it.type, it.id)));
}

// userId boleh null (belum login): `available` tetap dihitung, `passed` false.
export async function getPosttestState(
  supabase: SupabaseClient,
  userId: string | null,
  categoryId: string
): Promise<PosttestState> {
  const questionsReq = supabase
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("kind", POSTTEST_KIND);

  const resultsReq = userId
    ? supabase
        .from("quiz_results")
        .select("score, total")
        .eq("user_id", userId)
        .eq("category_id", categoryId)
        .eq("kind", POSTTEST_KIND)
    : Promise.resolve({ data: [] as { score: number | null; total: number | null }[], error: null });

  const [questionsRes, resultsRes] = await Promise.all([questionsReq, resultsReq]);

  if (questionsRes.error) throw new Error(questionsRes.error.message);
  if (resultsRes.error) throw new Error(resultsRes.error.message);

  return {
    available: (questionsRes.count ?? 0) > 0,
    passed: (resultsRes.data ?? []).some((r) => isPassing(r.score, r.total)),
  };
}

export async function getCategorySequenceState(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string
): Promise<CategorySequenceState> {
  const [materialsRes, exercisesRes, progressRes, posttest] = await Promise.all([
    supabase.from("materials").select("id, order_index").eq("category_id", categoryId),
    supabase.from("exercises").select("id, order_index").eq("category_id", categoryId),
    supabase
      .from("user_progress")
      .select("material_id, material_completed, exercise_id, exercise_status")
      .eq("user_id", userId)
      .eq("category_id", categoryId),
    getPosttestState(supabase, userId, categoryId),
  ]);

  // Kalau query gagal, lebih baik error daripada diam-diam mengunci/membuka
  // semua item.
  if (materialsRes.error) throw new Error(materialsRes.error.message);
  if (exercisesRes.error) throw new Error(exercisesRes.error.message);
  if (progressRes.error) throw new Error(progressRes.error.message);

  const sequence = buildSequence(materialsRes.data ?? [], exercisesRes.data ?? []);

  const completedKeys = new Set<string>();
  for (const row of progressRes.data ?? []) {
    if (row.material_id && row.material_completed) {
      completedKeys.add(itemKey("material", row.material_id));
    }
    if (row.exercise_id && row.exercise_status === "completed") {
      completedKeys.add(itemKey("exercise", row.exercise_id));
    }
  }

  return {
    sequence,
    completedKeys,
    unlockedKeys: computeUnlockedKeys(sequence, completedKeys),
    posttest: {
      ...posttest,
      unlocked: posttest.available && isSequenceComplete(sequence, completedKeys),
    },
  };
}

// Dipakai di server action. category_id dicari dari database (bukan dari
// parameter client) supaya tidak bisa dipalsukan, lalu dikembalikan supaya
// pemanggil bisa memakainya saat menyimpan progres.
export async function assertItemUnlocked(
  supabase: SupabaseClient,
  userId: string,
  type: SequenceItemType,
  id: string
): Promise<string> {
  const table = type === "material" ? "materials" : "exercises";
  const { data: item, error } = await supabase
    .from(table)
    .select("category_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!item) throw new Error("Item tidak ditemukan.");

  const state = await getCategorySequenceState(supabase, userId, item.category_id);
  if (!state.unlockedKeys.has(itemKey(type, id))) {
    throw new Error(LOCKED_MESSAGE);
  }

  return item.category_id as string;
}