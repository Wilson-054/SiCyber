"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Template "deptree": a dependency map where a vulnerability travels  */
/* up the chain, and the team only sees part of the tree.              */
/* Same variant/tour/rules model as the pipeline and logfile templates.*/
/* ------------------------------------------------------------------ */

type Outcome = "exploited" | "bypassed" | "neutralized";
type Tag = "vulnerable" | "weak" | "secure";

type Stage = { id: string; label: string };
// `node` = the component that is vulnerable in this scenario.
type Payload = { id: string; raw: string; explains: string; node?: string };
// `cutAt` = the component where the vulnerability was stopped.
type Result = {
  outcome: Outcome;
  stoppedAt: string | null;
  reason: string;
  label?: string;
  cutAt?: string;
};
type TreeNode = {
  id: string;
  label: string;
  parent: string | null;
  locked?: boolean; // cannot be updated (embedded / firmware)
  unused?: boolean; // installed but never called
};
type TreeConfig = { nodes: TreeNode[] };
// visible = what the team knows about in this implementation; removed = deleted.
type VariantTree = { visible?: string[] | "all"; removed?: string[] };
type Variant = {
  id: string;
  tag: Tag;
  label: string;
  code: string;
  explanation: string;
  tree?: VariantTree;
  results: Record<string, Result | undefined>;
};
type TourStep = { variant: string; focus?: string; stage?: string; caption: string };
type Rule = { title: string; text: string; proof: string };
type Labels = {
  journey?: string;
  ariaJourney?: string;
  list?: string;
  listHint?: string;
  detail?: string;
  allSafe?: string;
  someBad?: string;
  legendBad?: string;
  legendGood?: string;
};
export type DepTreeConfig = {
  stages: Stage[];
  tree: TreeConfig;
  payloads: Payload[];
  variants: Variant[];
  tour?: TourStep[];
  rules?: Rule[];
  labels?: Labels;
};

const DEFAULT_LABELS: Required<Labels> = {
  journey: "Perjalanan skenario",
  ariaJourney: "Tiga tahap yang dilalui skenario. Hasil tiap skenario ada di daftar di bawahnya.",
  list: "Skenario",
  listHint: "(ketuk untuk detail)",
  detail: "Latar skenario",
  allSafe: "Semua {total} skenario berhasil ditahan",
  someBad: "{n} dari {total} skenario berujung bahaya",
  legendBad: "kerentanan lolos",
  legendGood: "ditahan atau dimitigasi",
};

const TAG: Record<Tag, { label: string; cls: string; color: string }> = {
  vulnerable: { label: "Rentan", cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]", color: "#F85149" },
  weak: { label: "Lemah", cls: "border-[#D29922]/40 bg-[#D29922]/10 text-[#D29922]", color: "#D29922" },
  secure: { label: "Aman", cls: "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]", color: "#3FB950" },
};

const OUTCOME: Record<string, { label: string; cls: string; color: string }> = {
  exploited: { label: "Tereksploitasi", cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]", color: "#F85149" },
  bypassed: { label: "Lolos filter", cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]", color: "#F85149" },
  neutralized: { label: "Dinetralkan", cls: "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]", color: "#3FB950" },
};

const STEP_MS = 9000; // autoplay: how long the tour stays on each step
const TREE_STEP_MS = 380; // delay between tree levels while the vulnerability climbs
const MAX_DEPTH = 6;

export function isDepTreeConfig(c: unknown): c is DepTreeConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  const tree = o.tree as { nodes?: unknown } | undefined;
  return (
    Array.isArray(o.stages) &&
    o.stages.length >= 2 &&
    !!tree &&
    Array.isArray(tree.nodes) &&
    tree.nodes.length > 0 &&
    Array.isArray(o.payloads) &&
    o.payloads.length > 0 &&
    Array.isArray(o.variants) &&
    o.variants.length > 0 &&
    (o.variants as Variant[]).every((v) => v && typeof v.results === "object" && v.results !== null)
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// True once `token` has been painted at its start state and we may animate.
// A new token means "start over": it is false again on that very first render,
// so keyed elements remount at their start position instead of rewinding.
function useArrived(token: string, enabled: boolean) {
  const [done, setDone] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setDone(token));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [enabled, token]);
  return enabled && done === token;
}

function splitLabel(label: string): string[] {
  if (label.length <= 12 || !label.includes(" ")) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [label.slice(0, best), label.slice(best + 1)];
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Gates strip: inventory -> fix -> impact. Where did the scenario stop?*/
/* ------------------------------------------------------------------ */

function GatesStrip({
  title,
  ariaLabel,
  stages,
  result,
  go,
  litStage,
}: {
  title: string;
  ariaLabel: string;
  stages: Stage[];
  result: Result | undefined;
  go: boolean;
  litStage?: string;
}) {
  const n = stages.length;
  const xs = stages.map((_, i) => ((i + 0.5) / n) * 100);

  let endIdx = -1;
  if (result) {
    const idx = result.stoppedAt === null ? n - 1 : stages.findIndex((s) => s.id === result.stoppedAt);
    endIdx = idx >= 0 ? idx : n - 1;
  }
  const endColor = result ? (OUTCOME[result.outcome]?.color ?? "#8B949E") : "#8B949E";
  const span = xs[n - 1] - xs[0];
  const fill = endIdx > 0 ? ((xs[endIdx] - xs[0]) / span) * 100 : 0;

  return (
    <div className="rounded-lg border border-[#21262D] bg-[#161B22] p-4">
      <p className="mb-3 text-sm font-medium text-[#E6EDF3]">{title}</p>
      <div role="img" aria-label={ariaLabel}>
        <div className="relative h-5">
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-[#30363D]"
            style={{ left: `${xs[0]}%`, width: `${span}%` }}
          />
          <div
            className="absolute top-1/2 h-0.5 -translate-y-1/2 transition-[width] duration-[900ms] ease-out motion-reduce:transition-none"
            style={{
              left: `${xs[0]}%`,
              width: go ? `${(fill / 100) * span}%` : "0%",
              background: endColor,
            }}
          />
          {stages.map((s, i) => {
            const isEnd = go && i === endIdx;
            const passed = go && i < endIdx;
            const lit = litStage === s.id;
            const bg = isEnd ? endColor : passed ? "#8B949E" : "#21262D";
            return (
              <span
                key={s.id}
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500 motion-reduce:transition-none"
                style={{
                  left: `${xs[i]}%`,
                  background: bg,
                  boxShadow: lit ? "0 0 0 4px rgba(240,136,62,0.35)" : "none",
                  transitionDelay: go ? `${i * 300}ms` : "0ms",
                }}
              />
            );
          })}
        </div>
        <div className="mt-2 grid text-center text-[11px] leading-tight" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {stages.map((s, i) => {
            const isEnd = go && i === endIdx;
            const lit = litStage === s.id;
            return (
              <span
                key={s.id}
                className="px-1"
                style={{ color: lit ? "#F0883E" : isEnd ? endColor : "#8B949E", fontWeight: isEnd ? 600 : 400 }}
              >
                {splitLabel(s.label).map((line, k) => (
                  <span key={k} className="block">
                    {line}
                  </span>
                ))}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dependency tree: the vulnerability climbs from its component to the  */
/* app. Components the team cannot see stay "? ? ?" but still turn red. */
/* ------------------------------------------------------------------ */

function TreeCard({
  tree,
  variant,
  payload,
  result,
  go,
  token,
  onReplay,
}: {
  tree: TreeConfig;
  variant: Variant;
  payload: Payload;
  result: Result | undefined;
  go: boolean;
  token: string;
  onReplay: () => void;
}) {
  const nodes = tree.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const removed = new Set(variant.tree?.removed ?? []);
  const visible = variant.tree?.visible ?? "all";
  const isSeen = (n: TreeNode) => n.parent === null || visible === "all" || visible.includes(n.id);

  // Depth-first order and depth per node.
  const ordered: TreeNode[] = [];
  const depths = new Map<string, number>();
  const walk = (pid: string | null, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const n of nodes) {
      if (n.parent === pid) {
        ordered.push(n);
        depths.set(n.id, depth);
        walk(n.id, depth + 1);
      }
    }
  };
  walk(null, 0);

  // Chain from the vulnerable component up to the root.
  const vulnId = payload.node && byId.has(payload.node) ? payload.node : null;
  const chain: string[] = [];
  let cur: TreeNode | undefined = vulnId ? byId.get(vulnId) : undefined;
  for (let g = 0; cur && g < nodes.length; g++) {
    chain.push(cur.id);
    cur = cur.parent ? byId.get(cur.parent) : undefined;
  }

  const bad = !!result && result.outcome !== "neutralized";
  const cutId =
    result && !bad ? (result.cutAt && chain.includes(result.cutAt) ? result.cutAt : vulnId) : null;
  const cutIdx = cutId ? chain.indexOf(cutId) : -1;
  // Red = where the vulnerability travelled. Green = where it was stopped.
  const redIds = !result ? [] : bad ? chain : chain.slice(0, Math.max(cutIdx, 0));

  const real = ordered.filter((n) => n.parent !== null && !removed.has(n.id));
  const seenCount = real.filter(isSeen).length;
  const o = result ? OUTCOME[result.outcome] : undefined;

  return (
    <div className="rounded-lg border border-[#21262D] bg-[#161B22]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
        <span className="font-medium text-[#E6EDF3]">Peta dependensi</span>
        <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[#F85149]">
          {payload.id.toUpperCase()}
        </span>
        <span>
          Terlihat oleh tim: {seenCount} dari {real.length}
        </span>
        <button
          type="button"
          onClick={onReplay}
          className="ml-auto rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#8B949E] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
        >
          Putar ulang
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#8B949E]">Skenario</span>
          <span className="min-w-0 break-words rounded border border-[#F85149]/40 bg-[#F85149]/10 px-2 py-1 font-mono text-[#FF7B72]">
            {payload.raw}
          </span>
        </div>

        {/* keyed by token so a new selection remounts at its start state */}
        <div key={token} className="flex flex-col gap-1.5">
          {ordered.map((n) => {
            const depth = depths.get(n.id) ?? 0;
            const gone = removed.has(n.id);
            const seen = isSeen(n);
            const idx = chain.indexOf(n.id);
            const red = go && redIds.includes(n.id);
            const cut = go && n.id === cutId;
            const tone = red
              ? "border-[#F85149]/60 bg-[#F85149]/20"
              : cut
                ? "border-[#3FB950]/60 bg-[#3FB950]/15"
                : seen
                  ? "border-[#21262D] bg-[#0D1117]"
                  : "border-dashed border-[#30363D] bg-transparent";
            return (
              <div
                key={n.id}
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors duration-500 motion-reduce:transition-none ${tone} ${
                  gone ? "opacity-60" : ""
                }`}
                style={{
                  marginLeft: depth * 14,
                  transitionDelay: red || cut ? `${300 + idx * TREE_STEP_MS}ms` : "0ms",
                }}
              >
                {depth > 0 && (
                  <span aria-hidden="true" className="text-[#30363D]">
                    └
                  </span>
                )}
                {seen ? (
                  <code
                    className={`font-mono text-[13px] ${
                      gone ? "text-[#8B949E] line-through" : "text-[#E6EDF3]"
                    }`}
                  >
                    {n.label}
                  </code>
                ) : (
                  <span className="font-mono text-[13px] text-[#8B949E]">
                    ? ? ?<span className="sr-only"> komponen tidak terlihat oleh tim</span>
                  </span>
                )}
                {seen && n.locked && !gone && (
                  <span className="flex items-center gap-1 text-xs text-[#8B949E]">
                    <LockIcon />
                    tidak bisa diperbarui
                  </span>
                )}
                {seen && n.unused && !gone && <span className="text-xs text-[#8B949E]">tidak dipakai</span>}
                {gone && <span className="text-xs text-[#8B949E]">dihapus</span>}
                <span className="ml-auto flex items-center gap-1.5">
                  {cut && result?.label && (
                    <span className="text-xs font-medium text-[#3FB950]">{result.label}</span>
                  )}
                  {n.id === vulnId && (
                    <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#F85149]">
                      CVE
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <p className="border-t border-[#21262D] pt-3 text-xs leading-relaxed text-[#8B949E]">
          Merah: jalur kerentanan merambat ke aplikasi. Hijau: titik ia dihentikan. ? ? ?: komponen yang
          tidak terlihat oleh tim. CVE: kerentanan yang sebenarnya ada, terlihat atau tidak.
        </p>

        {result && o ? (
          <div className="space-y-1.5" aria-live="polite">
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${o.cls}`}>
              {result.label ?? o.label}
            </span>
            <p className="text-sm leading-relaxed text-[#C9D1D9]">{result.reason}</p>
          </div>
        ) : (
          <p className="text-sm text-[#8B949E]">Hasil untuk skenario ini belum tersedia di implementasi ini.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function DepTreeSimulation({ config }: { config: DepTreeConfig }) {
  const { stages, tree, payloads, variants } = config;
  const L = { ...DEFAULT_LABELS, ...(config.labels ?? {}) };

  // Only keep tour steps / rules that point at things that exist.
  const tour = useMemo(
    () =>
      (config.tour ?? []).filter(
        (s) =>
          variants.some((v) => v.id === s.variant) &&
          (!s.focus || payloads.some((p) => p.id === s.focus)),
      ),
    [config.tour, variants, payloads],
  );
  const rules = (config.rules ?? []).filter((r) => variants.some((v) => v.id === r.proof));

  const [variantId, setVariantId] = useState(variants[0].id);
  const [visited, setVisited] = useState<Set<string>>(() => new Set([variants[0].id]));
  const [pinned, setPinned] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [seen, setSeen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const animRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // While the tour runs, the current step decides what is shown.
  const step = tourStep !== null ? (tour[tourStep] ?? null) : null;
  const activeVariantId = step ? step.variant : variantId;
  const pinnedId = step ? (step.focus ?? null) : pinned;
  const variant = variants.find((v) => v.id === activeVariantId) ?? variants[0];

  function leaveTour() {
    if (step) {
      setVariantId(step.variant);
      setPinned(step.focus ?? null);
    }
    setTourStep(null);
    setAutoplay(false);
  }
  function selectVariant(id: string) {
    setPinned(pinnedId);
    setTourStep(null);
    setAutoplay(false);
    setVariantId(id);
    setVisited((prev) => new Set(prev).add(id));
  }
  function pickPayload(id: string) {
    if (step) {
      setVariantId(step.variant);
      setTourStep(null);
      setAutoplay(false);
    }
    setPinned(id);
  }
  function goStep(i: number) {
    const s = tour[i];
    if (!s) return;
    setTourStep(i);
    setVisited((prev) => new Set(prev).add(s.variant));
  }
  function startTour() {
    setSeen(true);
    setVisited(new Set([tour[0].variant]));
    setRunKey((k) => k + 1);
    setTourStep(0);
  }

  // Autoplay: advance the tour every STEP_MS, stop on the last step.
  useEffect(() => {
    if (tourStep === null || !autoplay) return;
    const t = setTimeout(() => {
      if (tourStep >= tour.length - 1) {
        setAutoplay(false);
        return;
      }
      const next = tourStep + 1;
      setTourStep(next);
      setVisited((prev) => new Set(prev).add(tour[next].variant));
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [tourStep, autoplay, tour]);

  // Progress bar for the current autoplay step.
  useEffect(() => {
    if (tourStep === null || !autoplay) return;
    const el = barRef.current;
    if (!el || typeof el.animate !== "function") return;
    const anim = el.animate([{ width: "0%" }, { width: "100%" }], {
      duration: STEP_MS,
      easing: "linear",
      fill: "forwards",
    });
    return () => anim.cancel();
  }, [tourStep, autoplay]);

  // Start the first animation only when the learner scrolls it into view.
  useEffect(() => {
    const el = animRef.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const tag = TAG[variant.tag] ?? TAG.weak;

  // Focus: the picked scenario, else the first one that hurt (the interesting one).
  const autoFocusId =
    payloads.find((p) => {
      const r = variant.results[p.id];
      return r && r.outcome !== "neutralized";
    })?.id ?? payloads[0].id;
  const focusId = pinnedId && payloads.some((p) => p.id === pinnedId) ? pinnedId : autoFocusId;
  const focus = payloads.find((p) => p.id === focusId) ?? payloads[0];
  const res = variant.results[focus.id];

  const token = `${variant.id}:${focusId}:${runKey}`;
  const go = useArrived(token, seen);

  // Score for the verdict banner, derived from the results.
  const known = payloads.filter((p) => variant.results[p.id]);
  const through = known.filter((p) => variant.results[p.id]?.outcome !== "neutralized").length;
  const scoreColor = through === 0 ? "#3FB950" : through === known.length ? "#F85149" : "#D29922";
  const scoreText =
    known.length === 0
      ? ""
      : (through === 0 ? L.allSafe : L.someBad)
          .replace("{n}", String(through))
          .replace("{total}", String(known.length));

  // Highlight lines that differ from the first (baseline) variant's code.
  const baseLines = new Set(variants[0].code.split("\n").map((l) => l.trim()));
  const codeLines = variant.code.split("\n").map((text) => ({
    text,
    changed: variant.id !== variants[0].id && text.trim() !== "" && !baseLines.has(text.trim()),
  }));
  const hasChanged = codeLines.some((l) => l.changed);

  const matrixCols = { gridTemplateColumns: `1fr repeat(${payloads.length}, 2rem)` };
  const navBtn =
    "rounded-md border px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      aria-label="Simulasi interaktif"
      className="my-10 space-y-6 lg:relative lg:left-1/2 lg:w-[min(68rem,calc(100vw_-_4rem))] lg:-translate-x-1/2"
    >
      {/* Controls: variant picker + start the guided tour */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-[#E6EDF3]">
            Pilih implementasi, lalu lihat apa yang terjadi pada dependensimu
          </p>
          <div role="group" aria-label="Pilih implementasi" className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const active = v.id === variant.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectVariant(v.id)}
                  className={`rounded-md border px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? "border-[#F0883E] bg-[#F0883E]/10 font-medium text-[#F0883E]"
                      : "border-[#21262D] text-[#8B949E] hover:border-[#8B949E] hover:text-[#E6EDF3]"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </div>

        {tour.length > 0 && !step && (
          <button
            type="button"
            onClick={startTour}
            className="rounded-md bg-[#F0883E] px-4 py-2.5 text-sm font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90"
          >
            Mulai pemandu
          </button>
        )}
      </div>

      {/* Guided tour */}
      {step && tourStep !== null && (
        <div role="status" className="rounded-lg border border-[#F0883E]/40 bg-[#F0883E]/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium text-[#F0883E]">
                Pemandu · langkah {tourStep + 1} dari {tour.length}
              </p>
              <p className="text-base leading-relaxed text-[#E6EDF3]">{step.caption}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={tourStep === 0}
                onClick={() => goStep(tourStep - 1)}
                className={`${navBtn} border-[#21262D] text-[#C9D1D9] hover:border-[#8B949E]`}
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => (tourStep >= tour.length - 1 ? leaveTour() : goStep(tourStep + 1))}
                className={`${navBtn} border-[#F0883E] bg-[#F0883E] font-medium text-[#0D1117] hover:bg-[#F0883E]/90`}
              >
                {tourStep >= tour.length - 1 ? "Selesai" : "Lanjut"}
              </button>
              <button
                type="button"
                aria-pressed={autoplay}
                onClick={() => setAutoplay((a) => !a)}
                className={`${navBtn} ${
                  autoplay
                    ? "border-[#F0883E] text-[#F0883E]"
                    : "border-[#21262D] text-[#8B949E] hover:border-[#8B949E]"
                }`}
              >
                Otomatis
              </button>
              <button
                type="button"
                onClick={leaveTour}
                className={`${navBtn} border-transparent text-[#8B949E] hover:text-[#E6EDF3]`}
              >
                Keluar
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-1.5" aria-hidden="true">
            {tour.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded ${i <= tourStep ? "bg-[#F0883E]" : "bg-[#21262D]"}`}
              />
            ))}
          </div>
          {autoplay && (
            <div className="mt-1.5 h-0.5 overflow-hidden rounded bg-[#21262D]" aria-hidden="true">
              <div ref={barRef} key={tourStep} className="h-full w-0 bg-[#F0883E]/70" />
            </div>
          )}
        </div>
      )}

      {/* Tree + gates (first on mobile)  |  code */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div
          className="order-2 min-w-0 overflow-hidden rounded-lg border border-[#21262D] bg-[#161B22] lg:order-1"
          style={{ borderLeft: `4px solid ${tag.color}` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
            <span className="font-medium text-[#E6EDF3]">{variant.label}</span>
            {hasChanged && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#F0883E]" />
                baris yang berubah dari kode awal
              </span>
            )}
          </div>
          <div className="py-3 font-mono text-[13px] leading-6 sm:text-sm">
            {codeLines.map((l, i) => (
              <div
                key={i}
                style={{ paddingInline: 16 }}
                className={`whitespace-pre-wrap break-words border-l-2 ${
                  l.changed
                    ? "border-[#F0883E] bg-[#F0883E]/10 text-[#E6EDF3]"
                    : "border-transparent text-[#C9D1D9]"
                }`}
              >
                {l.text === "" ? " " : l.text}
              </div>
            ))}
          </div>
        </div>

        <div ref={animRef} className="order-1 min-w-0 space-y-4 lg:order-2">
          <GatesStrip
            title={L.journey}
            ariaLabel={L.ariaJourney}
            stages={stages}
            result={res}
            go={go}
            litStage={step?.stage}
          />
          <TreeCard
            tree={tree}
            variant={variant}
            payload={focus}
            result={res}
            go={go}
            token={token}
            onReplay={() => setRunKey((k) => k + 1)}
          />
        </div>
      </div>

      {/* Verdict: the main lesson, full width */}
      <div
        aria-live="polite"
        className="flex flex-col gap-4 rounded-lg border border-[#21262D] bg-[#161B22] p-5 lg:flex-row lg:items-start lg:gap-8"
        style={{ borderLeft: `4px solid ${tag.color}` }}
      >
        <div className="flex flex-wrap items-center gap-3 lg:w-72 lg:shrink-0 lg:flex-col lg:items-start">
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${tag.cls}`}>{tag.label}</span>
          {scoreText && (
            <span className="text-base font-semibold" style={{ color: scoreColor }}>
              {scoreText}
            </span>
          )}
        </div>
        <p className="min-w-0 flex-1 text-base leading-relaxed text-[#E6EDF3]">{variant.explanation}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start">
        {/* Comparison matrix */}
        <div className="min-w-0 lg:col-start-1">
          <p className="mb-2 text-sm font-medium text-[#E6EDF3]">
            Perbandingan implementasi{" "}
            <span className="font-normal text-[#8B949E]">(terisi saat kamu mencoba tiap pilihan)</span>
          </p>
          <div className="overflow-hidden rounded-lg border border-[#21262D] bg-[#161B22]">
            <div
              className="grid items-center gap-x-2 border-b border-[#21262D] px-4 py-2 text-xs text-[#8B949E]"
              style={matrixCols}
            >
              <span>Implementasi</span>
              {payloads.map((p) => (
                <span key={p.id} className="text-center font-mono">
                  {p.id.toUpperCase()}
                </span>
              ))}
            </div>
            {variants.map((v) => {
              const active = v.id === variant.id;
              const tried = visited.has(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectVariant(v.id)}
                  className={`grid w-full items-center gap-x-2 border-b border-[#21262D] px-4 py-3 text-left text-sm transition-colors last:border-b-0 ${
                    active ? "bg-[#F0883E]/10 text-[#F0883E]" : "text-[#C9D1D9] hover:bg-[#0D1117]"
                  }`}
                  style={matrixCols}
                >
                  <span>{v.label}</span>
                  {payloads.map((p) => {
                    const r = v.results[p.id];
                    const oo = r ? OUTCOME[r.outcome] : undefined;
                    return (
                      <span key={p.id} className="flex justify-center">
                        {tried && oo ? (
                          <>
                            <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: oo.color }} />
                            <span className="sr-only">{r?.label ?? oo.label}</span>
                          </>
                        ) : (
                          <span className="text-[#8B949E]">{tried ? "–" : "?"}</span>
                        )}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#8B949E]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#F85149]" />
              {L.legendBad}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#3FB950]" />
              {L.legendGood}
            </span>
          </p>
        </div>

        {/* Scenario list: tap to focus + see the background */}
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <p className="mb-2 text-sm font-medium text-[#E6EDF3]">
            {L.list} <span className="font-normal text-[#8B949E]">{L.listHint}</span>
          </p>
          <ul className="space-y-2">
            {payloads.map((p) => {
              const r = variant.results[p.id];
              const oo = r ? OUTCOME[r.outcome] : undefined;
              const open = openId === p.id;
              const focused = p.id === focusId;
              return (
                <li
                  key={p.id}
                  className={`rounded-lg border bg-[#161B22] ${
                    focused ? "border-[#F0883E]/50" : "border-[#21262D]"
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      pickPayload(p.id);
                      setOpenId(open ? null : p.id);
                    }}
                    className="flex w-full items-start gap-3 p-3.5 text-left"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-xs text-[#F85149]">
                      {p.id.toUpperCase()}
                    </span>
                    <code className="min-w-0 flex-1 break-words font-mono text-sm text-[#F0883E]">{p.raw}</code>
                    <span aria-hidden="true" className="shrink-0 text-base text-[#8B949E]">
                      {open ? "−" : "+"}
                    </span>
                  </button>

                  <div className="space-y-2 px-3.5 pb-3.5">
                    {r && oo ? (
                      <>
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${oo.cls}`}
                        >
                          {r.label ?? oo.label}
                        </span>
                        <p className="text-sm leading-relaxed text-[#C9D1D9]">{r.reason}</p>
                      </>
                    ) : (
                      <p className="text-sm text-[#8B949E]">
                        Hasil untuk skenario ini belum tersedia di implementasi ini.
                      </p>
                    )}

                    {open && (
                      <div className="border-t border-[#21262D] pt-2">
                        <p className="mb-1 text-sm font-medium text-[#E6EDF3]">{L.detail}</p>
                        <p className="text-sm leading-relaxed text-[#C9D1D9]">{p.explains}</p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Takeaways for developers, each linked to the proof */}
        {rules.length > 0 && (
          <div className="min-w-0 lg:col-start-1">
            <p className="mb-2 text-sm font-medium text-[#E6EDF3]">Aturan untuk developer</p>
            <div className="grid gap-3">
              {rules.map((r, i) => {
                const proof = variants.find((v) => v.id === r.proof);
                return (
                  <div key={i} className="flex gap-3 rounded-lg border border-[#21262D] bg-[#161B22] p-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F0883E]/15 font-mono text-xs text-[#F0883E]">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#E6EDF3]">{r.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-[#C9D1D9]">{r.text}</p>
                      {proof && (
                        <button
                          type="button"
                          onClick={() => selectVariant(proof.id)}
                          className="mt-3 rounded border border-[#21262D] px-3 py-2 text-xs text-[#F0883E] transition-colors hover:border-[#F0883E]"
                        >
                          Lihat buktinya: {proof.label}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}