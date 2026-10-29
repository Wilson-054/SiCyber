
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPassing } from "./Quiz/posttest";

export type QuizKind = "interest" | "pretest" | "posttest" | "quiz";

export type QuizGroup = {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  kind: QuizKind;
  questionCount: number;
};

export async function getCategoryQuizzes(
  supabase: SupabaseClient,
  categoryId: string
): Promise<{ quizzes: QuizGroup[]; posttest: QuizGroup | null }> {
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, description, order_index, kind, quiz_questions(count)")
    .eq("category_id", categoryId)
    .in("kind", ["quiz", "posttest"])
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);

  const all = ((data ?? []) as unknown as (Omit<QuizGroup, "questionCount"> & {
    quiz_questions: { count: number }[];
  })[])
    .map(({ quiz_questions, ...q }) => ({ ...q, questionCount: quiz_questions?.[0]?.count ?? 0 }))
    .filter((q) => q.questionCount > 0);

  return {
    quizzes: all.filter((q) => q.kind === "quiz"),
    posttest: all.find((q) => q.kind === "posttest") ?? null,
  };
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