// Save as: app/actions/exercise-progress.ts
"use server";

import { createClient } from "@/../utils/supabase/server";
import { shouldShowReconsiderPrompt } from "@/../utils/Quiz/exercise-config";

type ProgressRow = {
  id?: string;
  hints_used: number;
  attempts_count: number;
  consecutive_failures: number;
  exercise_status: "not_started" | "in_progress" | "completed";
};

export type ProgressCounters = ProgressRow & { reconsiderPrompt: boolean };

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

  const row = await getOrCreateProgressRow(supabase, user.id, categoryId, exerciseId);

  const attempts_count = row.attempts_count + 1;
  const consecutive_failures = success ? 0 : row.consecutive_failures + 1;
  const exercise_status = success ? "completed" : "in_progress";

  const { data: updated, error } = await supabase
    .from("user_progress")
    .update({
      attempts_count,
      consecutive_failures,
      exercise_status,
      completed_at: success ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .select("hints_used, attempts_count, consecutive_failures, exercise_status")
    .single();

  if (error) throw error;

  return {
    ...updated,
    reconsiderPrompt: !success && shouldShowReconsiderPrompt(updated.hints_used, updated.consecutive_failures),
  };
}