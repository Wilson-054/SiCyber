// Save as: src/app/materi/[code]/posttest/page.tsx (MENGGANTIKAN versi lama)
//
// Halaman ini TIDAK lagi memuat soal. Soal baru dikirim oleh startPosttest
// setelah user menekan Mulai dan percobaannya tercatat.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";
import { getCategorySequenceState } from "@/../utils/progress-lock";
import {
  computeAttemptStatus,
  passingScore,
  POSTTEST_DURATION_MS,
  POSTTEST_KIND,
} from "@/../utils/Quiz/posttest";
import PosttestClient from "./posttest-client";

export default async function PosttestPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
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
            Masuk dulu untuk mengerjakan post-test. Hasil, sisa percobaan, dan sertifikatmu tersimpan di akunmu.
          </div>
        </div>
      </main>
    );
  }

  // Lock di sisi server: URL langsung ke post-test yang masih terkunci
  // dialihkan ke halaman daftar.
  const state = await getCategorySequenceState(supabase, user.id, category.id);
  if (!state.posttest.available) notFound();
  if (!state.posttest.unlocked) redirect(`/materi/${category.code}`);

  const [{ count }, { data: attempts }] = await Promise.all([
    supabase
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("category_id", category.id)
      .eq("kind", POSTTEST_KIND),
    supabase
      .from("quiz_results")
      .select("created_at, submitted_at, expires_at")
      .eq("user_id", user.id)
      .eq("category_id", category.id)
      .eq("kind", POSTTEST_KIND),
  ]);

  const rows = attempts ?? [];
  const status = computeAttemptStatus(rows.map((a) => a.created_at as string));
  const nowMs = Date.now();
  // Percobaan terbuka yang masih berjalan bisa dilanjutkan. Yang sudah lewat
  // waktu ditutup oleh startPosttest saat user menekan Mulai.
  const hasOpenAttempt = rows.some(
    (a) => !a.submitted_at && a.expires_at && new Date(a.expires_at as string).getTime() > nowMs
  );

  const questionCount = count ?? 0;

  return (
    <main className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {backLink}

        <header className="mb-8 border-b border-[#21262D] pb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Post-test {category.code}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#8B949E]">
            Lulus post-test untuk mendapatkan sertifikat kategori {category.name}.
          </p>
        </header>

        <PosttestClient
          categoryId={category.id}
          categoryCode={category.code}
          questionCount={questionCount}
          durationMinutes={Math.round(POSTTEST_DURATION_MS / 60000)}
          passMark={passingScore(questionCount)}
          initialStatus={status}
          initialHasOpenAttempt={hasOpenAttempt}
          alreadyPassed={state.posttest.passed}
        />
      </div>
    </main>
  );
}