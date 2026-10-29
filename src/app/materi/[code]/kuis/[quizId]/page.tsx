
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";
import { getQuizAccess } from "@/../utils/progress-lock";
import {
  computeAttemptStatus,
  passingScore,
  QUIZ_DURATION_MS,
} from "@/../utils/Quiz/quiz";
import QuizClient from "./quiz-client";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ code: string; quizId: string }>;
}) {
  const { code, quizId } = await params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, code, name")
    .eq("code", code.toUpperCase())
    .single();
  if (!category) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const backLink = (
    <Link
      href={`/materi/${category.code}`}
      className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#8B949E] hover:text-[#F0883E]"
    >
      ← {category.name}
    </Link>
  );

  if (!user) {
    return (
      <main className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
        <div className="mx-auto max-w-3xl px-6 py-16">
          {backLink}
          <div className="rounded-md border border-[#21262D] bg-[#161B22] px-4 py-6 text-sm text-[#8B949E]">
            Masuk dulu untuk mengerjakan kuis. Hasil dan progresmu tersimpan di akunmu.
          </div>
        </div>
      </main>
    );
  }

  const access = await getQuizAccess(supabase, user.id, quizId);
  if (access.status === "not_found" || access.quiz.category_id !== category.id) notFound();
  if (access.status === "locked") redirect(`/materi/${category.code}`);

  const { quiz, passed } = access;
  const issuesCertificate = quiz.kind === "posttest";

  const [{ count }, { data: attempts }] = await Promise.all([
    supabase.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", quiz.id),
    supabase
      .from("quiz_results")
      .select("created_at, submitted_at, expires_at")
      .eq("user_id", user.id)
      .eq("quiz_id", quiz.id),
  ]);

  const rows = attempts ?? [];
  const status = computeAttemptStatus(
    rows.map((a) => a.created_at as string),
    quiz.maxAttempts
  );
  const nowMs = Date.now();
  const hasOpenAttempt = rows.some(
    (a) => !a.submitted_at && a.expires_at && new Date(a.expires_at as string).getTime() > nowMs
  );

  const questionCount = count ?? 0;

  return (
    <main className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {backLink}

        <header className="mb-8 border-b border-[#21262D] pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{quiz.title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#8B949E]">
            {quiz.description ??
              (issuesCertificate
                ? `Lulus kuis ini untuk mendapatkan sertifikat kategori ${category.name}.`
                : `Kuis kategori ${category.name}.`)}
          </p>
        </header>

        <QuizClient
          quizId={quiz.id}
          categoryCode={category.code}
          questionCount={questionCount}
          durationMinutes={Math.round(QUIZ_DURATION_MS / 60000)}
          passMark={passingScore(questionCount)}
          initialStatus={status}
          initialHasOpenAttempt={hasOpenAttempt}
          alreadyPassed={passed}
          issuesCertificate={issuesCertificate}
        />
      </div>
    </main>
  );
}