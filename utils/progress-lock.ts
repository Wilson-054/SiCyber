

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCategoryQuizzes,
  getPassedQuizIds,
  getQuizById,
  type QuizGroup,
  type QuizMeta,
} from "./Quiz/quiz";

export type SequenceItemType = "material" | "exercise" | "quiz";
export type ContentItemType = "material" | "exercise";

export type SequenceItem = {
  type: SequenceItemType;
  id: string;
  order_index: number;
};

export type PosttestState = {
  available: boolean;
  passed: boolean;
};

export type CategorySequenceState = {
  sequence: SequenceItem[];
  quizzes: QuizGroup[];
  posttestQuiz: QuizGroup | null;
  completedKeys: Set<string>;
  unlockedKeys: Set<string>;
  posttest: PosttestState & { unlocked: boolean };
};

export const LOCKED_MESSAGE =
  "Item ini masih terkunci. Selesaikan item sebelumnya terlebih dahulu.";

const TYPE_RANK: Record<SequenceItemType, number> = {
  material: 0,
  exercise: 1,
  quiz: 2,
};

export function itemKey(type: SequenceItemType, id: string): string {
  return `${type}-${id}`;
}

export function quizKey(quizId: string): string {
  return itemKey("quiz", quizId);
}

export function buildSequence(
  materials: { id: string; order_index: number }[],
  exercises: { id: string; order_index: number }[],
  quizzes: { id: string; order_index: number }[] = []
): SequenceItem[] {
  const items: SequenceItem[] = [
    ...materials.map((m) => ({ type: "material" as const, id: m.id, order_index: m.order_index })),
    ...exercises.map((e) => ({ type: "exercise" as const, id: e.id, order_index: e.order_index })),
    ...quizzes.map((q) => ({ type: "quiz" as const, id: q.id, order_index: q.order_index })),
  ];

  return items.sort((a, b) => {
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    if (a.type !== b.type) return TYPE_RANK[a.type] - TYPE_RANK[b.type];
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

export function isSequenceComplete(
  sequence: SequenceItem[],
  completedKeys: Set<string>
): boolean {
  return sequence.every((it) => completedKeys.has(itemKey(it.type, it.id)));
}

export async function getPosttestState(
  supabase: SupabaseClient,
  userId: string | null,
  categoryId: string
): Promise<PosttestState> {
  const { posttest } = await getCategoryQuizzes(supabase, categoryId);
  if (!posttest) return { available: false, passed: false };

  const passedIds = userId
    ? await getPassedQuizIds(supabase, userId, categoryId)
    : new Set<string>();
  return { available: true, passed: passedIds.has(posttest.id) };
}

export async function getCategorySequenceState(
  supabase: SupabaseClient,
  userId: string,
  categoryId: string
): Promise<CategorySequenceState> {
  const [materialsRes, exercisesRes, progressRes, quizData, passedQuizIds] = await Promise.all([
    supabase.from("materials").select("id, order_index").eq("category_id", categoryId),
    supabase.from("exercises").select("id, order_index").eq("category_id", categoryId),
    supabase
      .from("user_progress")
      .select("material_id, material_completed, exercise_id, exercise_status")
      .eq("user_id", userId)
      .eq("category_id", categoryId),
    getCategoryQuizzes(supabase, categoryId),
    getPassedQuizIds(supabase, userId, categoryId),
  ]);

  if (materialsRes.error) throw new Error(materialsRes.error.message);
  if (exercisesRes.error) throw new Error(exercisesRes.error.message);
  if (progressRes.error) throw new Error(progressRes.error.message);

  const { quizzes, posttest } = quizData;
  const sequence = buildSequence(materialsRes.data ?? [], exercisesRes.data ?? [], quizzes);

  const completedKeys = new Set<string>();
  for (const row of progressRes.data ?? []) {
    if (row.material_id && row.material_completed) {
      completedKeys.add(itemKey("material", row.material_id));
    }
    if (row.exercise_id && row.exercise_status === "completed") {
      completedKeys.add(itemKey("exercise", row.exercise_id));
    }
  }
  for (const q of quizzes) {
    if (passedQuizIds.has(q.id)) completedKeys.add(quizKey(q.id));
  }

  return {
    sequence,
    quizzes,
    posttestQuiz: posttest,
    completedKeys,
    unlockedKeys: computeUnlockedKeys(sequence, completedKeys),
    posttest: {
      available: posttest != null,
      passed: posttest != null && passedQuizIds.has(posttest.id),
      unlocked: posttest != null && isSequenceComplete(sequence, completedKeys),
    },
  };
}

export async function assertItemUnlocked(
  supabase: SupabaseClient,
  userId: string,
  type: ContentItemType,
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

export type QuizAccess =
  | { status: "not_found" }
  | { status: "locked"; quiz: QuizMeta }
  | { status: "ok"; quiz: QuizMeta; passed: boolean };

export async function getQuizAccess(
  supabase: SupabaseClient,
  userId: string,
  quizId: string
): Promise<QuizAccess> {
  const quiz = await getQuizById(supabase, quizId);
  if (!quiz || (quiz.kind !== "quiz" && quiz.kind !== "posttest")) return { status: "not_found" };

  const state = await getCategorySequenceState(supabase, userId, quiz.category_id);
  const isPosttest = quiz.kind === "posttest";

  const known = isPosttest
    ? state.posttestQuiz?.id === quiz.id
    : state.quizzes.some((q) => q.id === quiz.id);
  if (!known) return { status: "not_found" };

  const unlocked = isPosttest ? state.posttest.unlocked : state.unlockedKeys.has(quizKey(quiz.id));
  if (!unlocked) return { status: "locked", quiz };

  const passed = isPosttest ? state.posttest.passed : state.completedKeys.has(quizKey(quiz.id));
  return { status: "ok", quiz, passed };
}