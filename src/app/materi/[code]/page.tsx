// Save as: src/app/materi/[code]/page.tsx (MENGGANTIKAN versi lama)
// Perubahan dari versi lama: item "posttest" ditambahkan di akhir daftar.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";
import {
  buildSequence,
  computeUnlockedKeys,
  getPosttestState,
  itemKey,
} from "@/../utils/progress-lock";

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
  type: "material" | "exercise" | "posttest";
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

const TYPE_LABEL: Record<ListItem["type"], string> = {
  material: "Materi",
  exercise: "Latihan",
  posttest: "Post-test",
};

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

  const [{ data: materials, error: materialsError }, { data: exercises, error: exercisesError }] = await Promise.all([
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

  let completedMaterialIds = new Set<string>();
  let exerciseStatusById = new Map<string, string>();

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

  // order_index adalah ruang penomoran GABUNGAN materi + exercise, jadi
  // setelah dipetakan ke ListItem harus di-sort ulang berdasarkan urutan
  // dari progress-lock (bukan urutan masing-masing query).
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
  ];

  const sequence = buildSequence(materials ?? [], exercises ?? []);
  const completedKeys = new Set(
    items.filter((it) => it.completed).map((it) => it.key)
  );
  const unlockedKeys = computeUnlockedKeys(sequence, completedKeys);
  const positionByKey = new Map(
    sequence.map((s, i) => [itemKey(s.type, s.id), i] as const)
  );

  items.sort(
    (a, b) => (positionByKey.get(a.key) ?? 0) - (positionByKey.get(b.key) ?? 0)
  );
  if (user) {
    for (const it of items) it.locked = !unlockedKeys.has(it.key);
  }

  // Post-test: selalu item terakhir, terbuka kalau semua item sebelumnya
  // selesai. Ditambahkan SETELAH sort supaya tidak ikut diurutkan.
  let posttestError: string | null = null;
  try {
    const posttest = await getPosttestState(supabase, user?.id ?? null, category.id);
    if (posttest.available) {
      const allDone = items.every((it) => it.completed);
      items.push({
        key: `posttest-${category.id}`,
        type: "posttest",
        title: `Post-test ${category.code}`,
        excerpt:
          "Kerjakan semua soal dalam satu halaman. Lulus dengan skor minimal 80%, dengan batas 3 percobaan.",
        difficulty_level: 1,
        order_index: Number.MAX_SAFE_INTEGER,
        href: `/materi/${category.code}/posttest`,
        completed: posttest.passed,
        inProgress: false,
        locked: user ? !allDone : false,
      });
    }
  } catch (e) {
    posttestError = e instanceof Error ? e.message : "Gagal memuat post-test.";
  }

  const hasError = materialsError || exercisesError || posttestError;

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
            Gagal memuat sebagian konten:{" "}
            {materialsError?.message ?? exercisesError?.message ?? posttestError}
          </div>
        )}

        {!hasError && items.length === 0 && (
          <div className="rounded-md border border-[#21262D] bg-[#161B22] px-4 py-6 text-sm text-[#8B949E]">
            Belum ada materi atau latihan untuk kategori ini.
          </div>
        )}

        <div className="space-y-4">
          {items.map((item, i) => {
            const content = (
              <>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-[#8B949E]">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex items-center gap-2">
                  {item.locked && (
                    <span className="rounded-full border border-[#21262D] bg-[#0D1117] px-2 py-0.5 text-[11px] text-[#8B949E]">
                      🔒 Terkunci
                    </span>
                  )}
                  {item.completed && (
                    <span className="rounded-full border border-[#238636]/40 bg-[#238636]/10 px-2 py-0.5 text-[11px] text-[#3FB950]">
                      ✓ {item.type === "posttest" ? "Lulus" : "Selesai"}
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
                        : "border-[#F0883E]/40 text-[#F0883E]"
                    }`}
                  >
                    {TYPE_LABEL[item.type]}
                  </span>
                  {item.type !== "posttest" && (
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

            if (item.locked) {
              return (
                <div
                  key={item.key}
                  aria-disabled="true"
                  className="block cursor-not-allowed rounded-md border border-[#21262D] bg-[#161B22] px-5 py-5 opacity-60"
                >
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                className="group block rounded-md border border-[#21262D] bg-[#161B22] px-5 py-5 transition-colors hover:border-[#F0883E]/50 hover:bg-[#1C2128]"
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