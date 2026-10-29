
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";
import { buildSequence, computeUnlockedKeys, itemKey } from "@/../utils/progress-lock";
import { getCategoryQuizzes, getPassedQuizIds, type QuizGroup } from "@/../utils/Quiz/quiz";

export const revalidate = 3600;

type Material = {
  id: string;
  title: string;
  content: string;
  difficulty_level: number;
  order_index: number;
};

type Exercise = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty_level: number;
  order_index: number;
};

type ListItem = {
  key: string;
  type: "material" | "exercise" | "quiz" | "posttest";
  title: string;
  excerpt: string | null;
  difficulty_level: number;
  order_index: number;
  href: string;
  completed: boolean;
  inProgress: boolean;
  locked: boolean;
};

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Dasar",
  2: "Menengah",
  3: "Lanjut",
};

// posttest memakai label yang sama dengan quiz: di tampilan keduanya "Kuis".
const TYPE_LABEL: Record<ListItem["type"], string> = {
  material: "Materi",
  exercise: "Latihan",
  quiz: "Kuis",
  posttest: "Kuis",
};

function quizExcerpt(q: QuizGroup, withCertificate: boolean): string {
  if (q.description) return q.description;
  const parts = [`${q.questionCount} soal pilihan ganda`, "Lulus dengan skor minimal 80%"];
  if (q.maxAttempts != null) parts.push(`Maksimal ${q.maxAttempts} percobaan`);
  if (withCertificate) parts.push("Lulus untuk mendapatkan sertifikat");
  return parts.join(". ") + ".";
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, code, name, description, owasp_rank")
    .eq("code", code.toUpperCase())
    .single();

  if (categoryError || !category) notFound();

  const [{ data: materials, error: materialsError }, { data: exercises, error: exercisesError }] =
    await Promise.all([
      supabase
        .from("materials")
        .select("id, title, content, difficulty_level, order_index")
        .eq("category_id", category.id)
        .order("order_index", { ascending: true }),
      supabase
        .from("exercises")
        .select("id, slug, title, description, difficulty_level, order_index")
        .eq("category_id", category.id)
        .order("order_index", { ascending: true }),
    ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const completedMaterialIds = new Set<string>();
  const exerciseStatusById = new Map<string, string>();

  if (user) {
    const { data: progress } = await supabase
      .from("user_progress")
      .select("material_id, material_completed, exercise_id, exercise_status")
      .eq("user_id", user.id)
      .eq("category_id", category.id);

    for (const row of progress ?? []) {
      if (row.material_id && row.material_completed) completedMaterialIds.add(row.material_id);
      if (row.exercise_id) exerciseStatusById.set(row.exercise_id, row.exercise_status);
    }
  }

  let quizGroups: QuizGroup[] = [];
  let posttestQuiz: QuizGroup | null = null;
  let passedQuizIds = new Set<string>();
  let quizError: string | null = null;
  try {
    const data = await getCategoryQuizzes(supabase, category.id);
    quizGroups = data.quizzes;
    posttestQuiz = data.posttest;
    if (user) passedQuizIds = await getPassedQuizIds(supabase, user.id, category.id);
  } catch (e) {
    quizError = e instanceof Error ? e.message : "Gagal memuat kuis.";
  }

  const items: ListItem[] = [
    ...(materials ?? []).map((m: Material) => ({
      key: `material-${m.id}`,
      type: "material" as const,
      title: m.title,
      excerpt: m.content,
      difficulty_level: m.difficulty_level,
      order_index: m.order_index,
      href: `/materi/${category.code}/${m.id}`,
      completed: completedMaterialIds.has(m.id),
      inProgress: false,
      locked: false,
    })),
    ...(exercises ?? []).map((ex: Exercise) => {
      const status = exerciseStatusById.get(ex.id) ?? "not_started";
      return {
        key: `exercise-${ex.id}`,
        type: "exercise" as const,
        title: ex.title,
        excerpt: ex.description,
        difficulty_level: ex.difficulty_level,
        order_index: ex.order_index,
        href: `/materi/${category.code}/exercise/${ex.slug}`,
        completed: status === "completed",
        inProgress: status === "in_progress",
        locked: false,
      };
    }),
    ...quizGroups.map((q) => ({
      key: itemKey("quiz", q.id),
      type: "quiz" as const,
      title: q.title,
      excerpt: quizExcerpt(q, false),
      difficulty_level: 1,
      order_index: q.order_index,
      href: `/materi/${category.code}/kuis/${q.id}`,
      completed: passedQuizIds.has(q.id),
      inProgress: false,
      locked: false,
    })),
  ];

  const sequence = buildSequence(materials ?? [], exercises ?? [], quizGroups);
  const completedKeys = new Set(items.filter((it) => it.completed).map((it) => it.key));
  const unlockedKeys = computeUnlockedKeys(sequence, completedKeys);
  const positionByKey = new Map(sequence.map((s, i) => [itemKey(s.type, s.id), i] as const));

  items.sort((a, b) => (positionByKey.get(a.key) ?? 0) - (positionByKey.get(b.key) ?? 0));
  if (user) {
    for (const it of items) it.locked = !unlockedKeys.has(it.key);
  }

  if (posttestQuiz) {
    const allDone = items.every((it) => it.completed);
    items.push({
      key: `posttest-${posttestQuiz.id}`,
      type: "posttest",
      title: posttestQuiz.title,
      excerpt: quizExcerpt(posttestQuiz, true),
      difficulty_level: 1,
      order_index: Number.MAX_SAFE_INTEGER,
      href: `/materi/${category.code}/kuis/${posttestQuiz.id}`,
      completed: passedQuizIds.has(posttestQuiz.id),
      inProgress: false,
      locked: user ? !allDone : false,
    });
  }

  const hasError = materialsError || exercisesError || quizError;

  return (
    <main className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/materi"
          className="mb-8 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#8B949E] hover:text-[#F0883E]"
        >
          ← Semua kategori
        </Link>

        <header className="mb-10 border-b border-[#21262D] pb-8">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#F0883E]">
            {category.code} · Rank #{category.owasp_rank ?? "—"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
          {category.description && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#8B949E]">{category.description}</p>
          )}
        </header>

        {hasError && (
          <div className="mb-6 rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-4 py-3 text-sm text-[#F0883E]">
            Gagal memuat sebagian konten: {materialsError?.message ?? exercisesError?.message ?? quizError}
          </div>
        )}

        {!hasError && items.length === 0 && (
          <div className="rounded-md border border-[#21262D] bg-[#161B22] px-4 py-6 text-sm text-[#8B949E]">
            Belum ada materi atau latihan untuk kategori ini.
          </div>
        )}

        <div className="space-y-4">
          {items.map((item, i) => {
            const isPosttest = item.type === "posttest";
            const isContent = item.type === "material" || item.type === "exercise";

            const content = (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-[#8B949E]">{String(i + 1).padStart(2, "0")}</span>
                  <div className="flex items-center gap-2">
                    {item.locked && (
                      <span className="rounded-full border border-[#21262D] bg-[#0D1117] px-2 py-0.5 text-[11px] text-[#8B949E]">
                         Terkunci
                      </span>
                    )}
                    {item.completed && (
                      <span className="rounded-full border border-[#238636]/40 bg-[#238636]/10 px-2 py-0.5 text-[11px] text-[#3FB950]">
                        ✓ {isContent ? "Selesai" : "Lulus"}
                      </span>
                    )}
                    {item.inProgress && (
                      <span className="rounded-full border border-[#F0883E]/40 bg-[#F0883E]/10 px-2 py-0.5 text-[11px] text-[#F0883E]">
                        Sedang dikerjakan
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                        item.type === "material"
                          ? "border-[#21262D] text-[#8B949E]"
                          : isPosttest
                          ? "border-[#F0883E] bg-[#F0883E]/10 font-medium text-[#F0883E]"
                          : "border-[#F0883E]/40 text-[#F0883E]"
                      }`}
                    >
                      {TYPE_LABEL[item.type]}
                    </span>
                    {isPosttest && (
                      <span className="rounded-full border border-[#3FB950]/40 bg-[#3FB950]/10 px-2 py-0.5 text-[11px] text-[#3FB950]">
                        Sertifikat
                      </span>
                    )}
                    {isContent && (
                      <span className="rounded-full border border-[#21262D] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[#8B949E]">
                        {DIFFICULTY_LABEL[item.difficulty_level] ?? "Dasar"}
                      </span>
                    )}
                  </div>
                </div>
                <h2 className="mb-2 text-lg font-medium text-[#E6EDF3] group-hover:text-white">{item.title}</h2>
                {item.locked ? (
                  <p className="text-sm leading-relaxed text-[#8B949E]">
                    Selesaikan item sebelumnya untuk membuka ini.
                  </p>
                ) : (
                  item.excerpt && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-[#8B949E]">{item.excerpt}</p>
                  )
                )}
              </>
            );

            const baseBox = `block rounded-md border bg-[#161B22] px-5 py-5 ${
              isPosttest ? "border-[#F0883E]/40" : "border-[#21262D]"
            }`;

            if (item.locked) {
              return (
                <div key={item.key} aria-disabled="true" className={`${baseBox} cursor-not-allowed opacity-60`}>
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`group ${baseBox} transition-colors hover:border-[#F0883E]/50 hover:bg-[#1C2128]`}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}