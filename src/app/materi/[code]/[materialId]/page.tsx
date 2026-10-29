import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Children, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/../utils/supabase/server";
import { getCategorySequenceState, itemKey } from "@/../utils/progress-lock";
import MarkCompleteButton from "@/app/components/Materi/MarkCompleteButton";
import SimulationEmbedLazy from "@/app/components/Materi/SimulationEmbedLazy";
import type { SimulationRow } from "@/app/components/Materi/SimulationEmbed";

export const revalidate = 3600;

type Material = {
  id: string;
  title: string;
  content: string;
  difficulty_level: number;
  order_index: number;
};

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Dasar",
  2: "Menengah",
  3: "Lanjut",
};

const markdownComponents = {
  h2: (props: React.ComponentProps<"h2">) => (
    <h2 className="mb-3 mt-8 text-xl font-semibold text-[#E6EDF3]" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="mb-2 mt-6 text-lg font-medium text-[#E6EDF3]" {...props} />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="mb-4 text-sm leading-relaxed text-[#C9D1D9]" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mb-4 ml-5 list-disc space-y-1.5 text-sm text-[#C9D1D9]" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="mb-4 ml-5 list-decimal space-y-1.5 text-sm text-[#C9D1D9]" {...props} />
  ),
  li: (props: React.ComponentProps<"li">) => <li className="pl-1" {...props} />,
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-[#E6EDF3]" {...props} />
  ),
  a: (props: React.ComponentProps<"a">) => (
    <a className="text-[#F0883E] underline underline-offset-2" {...props} />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code className="rounded bg-[#161B22] px-1.5 py-0.5 font-mono text-xs text-[#F0883E]" {...props} />
  ),
  pre: (props: React.ComponentProps<"pre">) => (
    <pre
      className="mb-4 overflow-x-auto rounded-md border border-[#21262D] bg-[#161B22] p-4 text-xs leading-relaxed"
      {...props}
    />
  ),
};

// True when a <pre> only wraps a ```simulation block, so we can skip the code-box wrapper.
function isSimBlock(children: React.ReactNode) {
  const first = Children.toArray(children)[0];
  return (
    isValidElement<{ className?: string }>(first) &&
    !!first.props.className?.includes("language-simulation")
  );
}

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ code: string; materialId: string }>;
}) {
  const { code, materialId } = await params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, code, name")
    .eq("code", code.toUpperCase())
    .single();

  if (!category) notFound();

  const { data: materials } = await supabase
    .from("materials")
    .select("id, title, content, difficulty_level, order_index")
    .eq("category_id", category.id)
    .order("order_index", { ascending: true });

  const list = (materials ?? []) as Material[];
  const currentIndex = list.findIndex((m) => m.id === materialId);
  const material = currentIndex >= 0 ? list[currentIndex] : null;

  if (!material) notFound();

  const prev = currentIndex > 0 ? list[currentIndex - 1] : null;
  const next = currentIndex < list.length - 1 ? list[currentIndex + 1] : null;

  // Simulations that belong to this material, looked up by the id written in the marker.
  const { data: simRows } = await supabase
    .from("simulations")
    .select("id, template, config")
    .eq("material_id", material.id);
  const simMap = new Map<string, SimulationRow>((simRows ?? []).map((s) => [s.id, s]));

  const components = {
    ...markdownComponents,
    pre: (props: React.ComponentProps<"pre">) =>
      isSimBlock(props.children) ? <>{props.children}</> : markdownComponents.pre(props),
    code: (props: React.ComponentProps<"code">) =>
      props.className?.includes("language-simulation") ? (
        <SimulationEmbedLazy sim={simMap.get(String(props.children).trim())} />
      ) : (
        markdownComponents.code(props)
      ),
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let alreadyCompleted = false;
  let nextLocked = false;
  let isLastInCategory = !next;

  if (user) {
    const state = await getCategorySequenceState(supabase, user.id, category.id);
    const key = itemKey("material", material.id);

    if (!state.unlockedKeys.has(key)) {
      redirect(`/materi/${category.code}`);
    }

    alreadyCompleted = state.completedKeys.has(key);
    nextLocked = next
      ? !state.unlockedKeys.has(itemKey("material", next.id))
      : false;

    // "Materi terakhir" = item terakhir di urutan gabungan materi + exercise,
    // bukan sekadar materi terakhir (bisa saja masih ada exercise sesudahnya).
    const last = state.sequence[state.sequence.length - 1];
    isLastInCategory = !!last && itemKey(last.type, last.id) === key;
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
            {DIFFICULTY_LABEL[material.difficulty_level] ?? "Dasar"}
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{material.title}</h1>
        </header>

        <article>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {material.content}
          </ReactMarkdown>
        </article>

        <div className="mt-10 flex items-center justify-between gap-4 border-t border-[#21262D] pt-6">
          {prev ? (
            <Link
              href={`/materi/${category.code}/${prev.id}`}
              className="max-w-[30%] truncate font-mono text-xs text-[#8B949E] hover:text-[#F0883E]"
            >
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}

          <MarkCompleteButton
            materialId={material.id}
            categoryId={category.id}
            categoryCode={category.code}
            initialCompleted={alreadyCompleted}
            isLastMaterial={isLastInCategory}
          />

          {next ? (
            nextLocked ? (
              <span
                aria-disabled="true"
                className="max-w-[30%] cursor-not-allowed truncate text-right font-mono text-xs text-[#8B949E] opacity-50"
              >
                 {next.title}
              </span>
            ) : (
              <Link
                href={`/materi/${category.code}/${next.id}`}
                className="max-w-[30%] truncate text-right font-mono text-xs text-[#8B949E] hover:text-[#F0883E]"
              >
                {next.title} →
              </Link>
            )
          ) : (
            <span />
          )}
        </div>
      </div>
    </main>
  );
}