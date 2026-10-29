
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuizKind } from "./types";

export const PASSING_RATIO = 0.8;
export const ATTEMPT_REGEN_MS = 24 * 60 * 60 * 1000;
export const QUIZ_DURATION_MS = 60 * 60 * 1000;
export const QUIZ_GRACE_MS = 30 * 1000;

export function isPassing(score: number | null, total: number | null): boolean {
  if (score == null || !total || total <= 0) return false;
  return score / total >= PASSING_RATIO;
}

export function passingScore(total: number): number {
  return Math.ceil(total * PASSING_RATIO - 1e-9);
}

export function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface AttemptStatus {
  used: number;
  remaining: number | null;
  nextRegenAt: string | null;
  maxAttempts: number | null;
}

export function computeAttemptStatus(
  attemptTimes: string[],
  maxAttempts: number | null,
  now: number = Date.now()
): AttemptStatus {
  if (maxAttempts == null) {
    return { used: attemptTimes.length, remaining: null, nextRegenAt: null, maxAttempts: null };
  }

  const active = attemptTimes
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t) && now - t < ATTEMPT_REGEN_MS)
    .sort((a, b) => a - b);

  const remaining = Math.max(0, maxAttempts - active.length);
  const idx = Math.min(Math.max(0, active.length - maxAttempts), active.length - 1);
  const nextRegenAt =
    active.length === 0 ? null : new Date(active[idx] + ATTEMPT_REGEN_MS).toISOString();

  return { used: active.length, remaining, nextRegenAt, maxAttempts };
}

export type QuizGroup = {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  kind: QuizKind;
  maxAttempts: number | null;
  questionCount: number;
};

export type QuizMeta = Omit<QuizGroup, "questionCount"> & { category_id: string };

type QuizRow = {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  kind: QuizKind;
  attempts: number | null;
};

export async function getCategoryQuizzes(
  supabase: SupabaseClient,
  categoryId: string
): Promise<{ quizzes: QuizGroup[]; posttest: QuizGroup | null }> {
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, description, order_index, kind, attempts, quiz_questions(count)")
    .eq("category_id", categoryId)
    .in("kind", ["quiz", "posttest"])
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);

  const all: QuizGroup[] = ((data ?? []) as unknown as (QuizRow & {
    quiz_questions: { count: number }[];
  })[])
    .map(({ quiz_questions, attempts, ...q }) => ({
      ...q,
      maxAttempts: attempts ?? null,
      questionCount: quiz_questions?.[0]?.count ?? 0,
    }))
    .filter((q) => q.questionCount > 0);

  return {
    quizzes: all.filter((q) => q.kind === "quiz"),
    posttest: all.find((q) => q.kind === "posttest") ?? null,
  };
}

export async function getQuizById(
  supabase: SupabaseClient,
  quizId: string
): Promise<QuizMeta | null> {
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, category_id, title, description, order_index, kind, attempts")
    .eq("id", quizId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { attempts, ...rest } = data as unknown as QuizRow & { category_id: string };
  return { ...rest, maxAttempts: attempts ?? null };
}

export async function getPassedQuizIds(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("quiz_results")
    .select("quiz_id, score, total, quizzes!inner(category_id)")
    .eq("user_id", userId)
    .eq("quizzes.category_id", categoryId)
    .not("submitted_at", "is", null);
  if (error) throw new Error(error.message);

  const passed = new Set<string>();
  for (const r of (data ?? []) as unknown as {
    quiz_id: string | null;
    score: number | null;
    total: number | null;
  }[]) {
    if (r.quiz_id && isPassing(r.score, r.total)) passed.add(r.quiz_id);
  }
  return passed;
}