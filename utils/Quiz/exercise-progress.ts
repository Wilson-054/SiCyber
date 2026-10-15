// Save as: utils/Quiz/exercise-progress.ts (replaces existing file)
"use server";

import { createClient } from "@/../utils/supabase/server";
import { shouldShowReconsiderPrompt } from "@/../utils/Quiz/exercise-config";
import type { AwardedCertification } from "@/../utils/certifications";
import { assertItemUnlocked } from "@/../utils/progress-lock";

type ProgressRow = {
  id?: string;
  hints_used: number;
  attempts_count: number;
  consecutive_failures: number;
  exercise_status: "not_started" | "in_progress" | "completed";
};

export type ProgressCounters = ProgressRow & {
  reconsiderPrompt: boolean;
  // Dipertahankan hanya supaya ExerciseWorkspace yang masih membacanya tidak
  // error. Sertifikat sekarang hanya terbit setelah lulus post-test, jadi
  // nilainya selalu kosong dari file ini.
  newCertifications?: AwardedCertification[];
};

async function getOrCreateProgressRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  exerciseId: string
) {
  const { data: existing } = await supabase
    .from("user_progress")
    .select("id, hints_used, attempts_count, consecutive_failures, exercise_status")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("user_progress")
    .insert({ user_id: userId, category_id: categoryId, exercise_id: exerciseId, exercise_status: "in_progress" })
    .select("id, hints_used, attempts_count, consecutive_failures, exercise_status")
    .single();

  if (error) throw error;
  return created;
}

export async function recordHintRevealed(
  categoryId: string,
  exerciseId: string
): Promise<ProgressCounters | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // not logged in — UI still lets them practice, just doesn't persist

  // Lock berbasis order_index: tolak sebelum baris progres dibuat.
  await assertItemUnlocked(supabase, user.id, "exercise", exerciseId);

  const row = await getOrCreateProgressRow(supabase, user.id, categoryId, exerciseId);
  const hints_used = row.hints_used + 1;

  const { data: updated, error } = await supabase
    .from("user_progress")
    .update({ hints_used, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .select("hints_used, attempts_count, consecutive_failures, exercise_status")
    .single();

  if (error) throw error;

  return { ...updated, reconsiderPrompt: shouldShowReconsiderPrompt(updated.hints_used, updated.consecutive_failures) };
}

export async function recordAttempt(
  categoryId: string,
  exerciseId: string,
  success: boolean
): Promise<ProgressCounters | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Lock berbasis order_index: tolak sebelum baris progres dibuat.
  await assertItemUnlocked(supabase, user.id, "exercise", exerciseId);

  const row = await getOrCreateProgressRow(supabase, user.id, categoryId, exerciseId);
  const alreadyCompleted = row.exercise_status === "completed";

  const attempts_count = row.attempts_count + 1;
  const consecutive_failures = success ? 0 : row.consecutive_failures + 1;
  const now = new Date().toISOString();

  // Status tidak pernah turun dari "completed".
  const exercise_status: ProgressRow["exercise_status"] =
    alreadyCompleted || success ? "completed" : "in_progress";

  const patch: Record<string, unknown> = {
    attempts_count,
    consecutive_failures,
    exercise_status,
    updated_at: now,
  };
  // completed_at hanya diisi pada transisi pertama ke completed.
  if (success && !alreadyCompleted) patch.completed_at = now;

  const { data: updated, error } = await supabase
    .from("user_progress")
    .update(patch)
    .eq("id", row.id)
    .select("hints_used, attempts_count, consecutive_failures, exercise_status")
    .single();

  if (error) throw error;

  return {
    ...updated,
    reconsiderPrompt: !success && shouldShowReconsiderPrompt(updated.hints_used, updated.consecutive_failures),
    newCertifications: [],
  };
}