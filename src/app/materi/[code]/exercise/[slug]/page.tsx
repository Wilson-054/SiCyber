

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";
import { getCategorySequenceState, itemKey } from "@/../utils/progress-lock";
import ExerciseWorkspace from "@/../utils/Quiz/exercise-workspace";
import type { ExerciseCriteria } from "@/../utils/Quiz/types";
const DIFFICULTY_LABEL: Record<number, string> = { 1: "Dasar", 2: "Menengah", 3: "Lanjut" };
import { Children, isValidElement } from "react";
import SimulationEmbedLazy from "@/app/components/Materi/SimulationEmbedLazy";
import type { SimulationRow } from "@/app/components/Materi/SimulationEmbed";

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ code: string; slug: string }>;
}) {
  const { code, slug } = await params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, code, name")
    .eq("code", code.toUpperCase())
    .single();
  if (!category) notFound();

  const { data: exercise } = await supabase
    .from("exercises")
    .select("id, slug, title, description, difficulty_level, scenario_config, success_criteria")
    .eq("category_id", category.id)
    .eq("slug", slug)
    .single();
  if (!exercise) notFound();
  const criteria = exercise.success_criteria as ExerciseCriteria;
  if (!criteria?.type) notFound();

  const { data: { user } } = await supabase.auth.getUser();

  let isLastExercise = false;
  if (user) {
    const state = await getCategorySequenceState(supabase, user.id, category.id);
    const key = itemKey("exercise", exercise.id);

    if (!state.unlockedKeys.has(key)) {
      redirect(`/materi/${category.code}`);
    }

    const last = state.sequence[state.sequence.length - 1];
    isLastExercise = !!last && itemKey(last.type, last.id) === key;
  } else {
    const { data: allExercises } = await supabase
      .from("exercises")
      .select("id, order_index")
      .eq("category_id", category.id)
      .order("order_index", { ascending: true });
    const list = allExercises ?? [];
    isLastExercise = list.length > 0 && list[list.length - 1].id === exercise.id;
  }
  const { data: hints } = await supabase
    .from("exercise_hints")
    .select("id, hint_order, content")
    .eq("exercise_id", exercise.id)
    .order("hint_order", { ascending: true });

  const { data: feedbackRows } = await supabase
    .from("exercise_feedback")
    .select("outcome, notification_message, explanation, implementation_notes")
    .eq("exercise_id", exercise.id);

  const feedbackByOutcome = {
    success: feedbackRows?.find((f) => f.outcome === "success"),
    failure: feedbackRows?.find((f) => f.outcome === "failure"),
  };

  let initialCounters = { hints_used: 0, attempts_count: 0, consecutive_failures: 0, exercise_status: "not_started" };
  if (user) {
    const { data: progress } = await supabase
      .from("user_progress")
      .select("hints_used, attempts_count, consecutive_failures, exercise_status")
      .eq("user_id", user.id)
      .eq("exercise_id", exercise.id)
      .maybeSingle();
    if (progress) initialCounters = progress;
  }

  return (
    <main className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href={`/materi/${category.code}`}
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#8B949E] hover:text-[#F0883E]"
        >
          ← {category.name}
        </Link>

        <header className="mb-8 border-b border-[#21262D] pb-6">
          <span className="rounded-full border border-[#21262D] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[#8B949E]">
            {DIFFICULTY_LABEL[exercise.difficulty_level] ?? "Dasar"}
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{exercise.title}</h1>
          {exercise.description && <p className="mt-3 text-sm leading-relaxed text-[#8B949E]">{exercise.description}</p>}
        </header>

        {!user && (
          <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] px-4 py-3 text-sm text-[#8B949E]">
            Masuk untuk menyimpan progres latihan ini.
          </div>
        )}

        <ExerciseWorkspace
          categoryId={category.id}
          categoryCode={category.code}
          exerciseId={exercise.id}
          hints={hints ?? []}
          scenarioConfig={exercise.scenario_config ?? {}}
          criteria={criteria}
          feedbackByOutcome={feedbackByOutcome}
          initialCounters={initialCounters}
          isLastExercise={isLastExercise}
        />
      </div>
    </main>
  );
}