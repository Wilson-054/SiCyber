// Save as: app/materi/[code]/page.tsx (replaces previous version)

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/../utils/supabase/server";

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
  type: "material" | "exercise";
  title: string;
  excerpt: string | null;
  difficulty_level: number;
  order_index: number;
  href: string;
  completed: boolean;
  inProgress: boolean;
};

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Dasar",
  2: "Menengah",
  3: "Lanjut",
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

  // Merge materials + exercises into a single ordered list. `order_index`
  // is a SHARED numbering space between the two tables (multiples of 10 —
  // see the A01 seed dump comments), specifically so materi and lab bisa
  // diselang-seling, mis. 10 materi -> 20 lab -> 30 materi -> 40 materi ->
  // 50 lab. Jadi setelah kedua array dipetakan ke ListItem, harus di-sort
  // ULANG berdasarkan order_index gabungan — bukan sekadar materials dulu
  // baru exercises, dan bukan cuma mengandalkan urutan dari masing-masing
  // query (kedua request di atas berjalan paralel, urutannya tidak
  // dijamin selaras satu sama lain).
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
      };
    }),
  ].sort((a, b) => a.order_index - b.order_index);

  const hasError = materialsError || exercisesError;

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
            Gagal memuat sebagian konten: {materialsError?.message ?? exercisesError?.message}
          </div>
        )}

        {!hasError && items.length === 0 && (
          <div className="rounded-md border border-[#21262D] bg-[#161B22] px-4 py-6 text-sm text-[#8B949E]">
            Belum ada materi atau latihan untuk kategori ini.
          </div>
        )}

        <div className="space-y-4">
          {items.map((item, i) => (
            <Link
              key={item.key}
              href={item.href}
              className="group block rounded-md border border-[#21262D] bg-[#161B22] px-5 py-5 transition-colors hover:border-[#F0883E]/50 hover:bg-[#1C2128]"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-[#8B949E]">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex items-center gap-2">
                  {item.completed && (
                    <span className="rounded-full border border-[#238636]/40 bg-[#238636]/10 px-2 py-0.5 text-[11px] text-[#3FB950]">
                      ✓ Selesai
                    </span>
                  )}
                  {item.inProgress && (
                    <span className="rounded-full border border-[#F0883E]/40 bg-[#F0883E]/10 px-2 py-0.5 text-[11px] text-[#F0883E]">
                      Sedang dikerjakan
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                      item.type === "exercise"
                        ? "border-[#F0883E]/40 text-[#F0883E]"
                        : "border-[#21262D] text-[#8B949E]"
                    }`}
                  >
                    {item.type === "exercise" ? "Latihan" : "Materi"}
                  </span>
                  <span className="rounded-full border border-[#21262D] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[#8B949E]">
                    {DIFFICULTY_LABEL[item.difficulty_level] ?? "Dasar"}
                  </span>
                </div>
              </div>
              <h2 className="mb-2 text-lg font-medium text-[#E6EDF3] group-hover:text-white">{item.title}</h2>
              {item.excerpt && (
                <p className="line-clamp-2 text-sm leading-relaxed text-[#8B949E]">{item.excerpt}</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}