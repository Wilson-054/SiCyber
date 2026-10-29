"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import LogFileSimulation, { isLogConfig } from "./LogFileSimulation";
import EntropySimulation, { isEntropyConfig } from "./Entrophysimulation";
import DepTreeSimulation, { isDepTreeConfig } from "./Treesimulation";
import BoundarySimulation, { isBoundaryConfig } from "./BoundarySimulation";
import FaultSimulation, { isFaultConfig } from "./Faultsimulation";


/* ------------------------------------------------------------------ */
/* Types (mirror the JSON in simulations.config)                       */
/* ------------------------------------------------------------------ */

type Outcome = "exploited" | "bypassed" | "neutralized";
type Tag = "vulnerable" | "weak" | "secure";

type Stage = { id: string; label: string; icon?: string };
type Payload = { id: string; raw: string; explains: string };
type Result = { outcome: Outcome; stoppedAt: string | null; reason: string; label?: string };
// What the database receives. `{input}` is replaced by the payload text.
// mode "separate" = the value travels beside the command (parameterized).
type QuerySpec = { template: string; mode?: "inline" | "separate"; note?: string };
type Variant = {
  id: string;
  tag: Tag;
  label: string;
  code: string;
  explanation: string;
  query?: QuerySpec;
  results: Record<string, Result | undefined>;
};
// One narrated step of the guided tour.
type TourStep = { variant: string; focus?: string; stage?: string; caption: string };
// A takeaway for developers, linked to the implementation that proves it.
type Rule = { title: string; text: string; proof: string };
type Labels = {
  journey?: string;
  list?: string;
  listHint?: string;
  detail?: string;
  ariaJourney?: string;
  allSafe?: string;
  someBad?: string;
  legendBad?: string;
  legendGood?: string;
};
type PipelineConfig = {
  stages: Stage[];
  payloads: Payload[];
  variants: Variant[];
  tour?: TourStep[];
  rules?: Rule[];
  labels?: Labels;
};

const DEFAULT_LABELS: Required<Labels> = {
  journey: "Perjalanan payload",
  list: "Payload serangan",
  listHint: "(ketuk untuk detail)",
  detail: "Cara kerja payload",
  ariaJourney: "Animasi payload bergerak melewati tiap tahap. Hasil tiap payload ada di daftar di bawahnya.",
  allSafe: "Semua {total} serangan berhasil diblokir",
  someBad: "{n} dari {total} serangan berhasil menembus",
  legendBad: "serangan lolos",
  legendGood: "serangan dinetralkan",
};

// Row shape as it comes from the `simulations` table.
export type SimulationRow = { id: string; template: string; config: unknown };

/* ------------------------------------------------------------------ */
/* Styling tables (full class strings so Tailwind can see them)        */
/* ------------------------------------------------------------------ */

const TAG: Record<Tag, { label: string; cls: string; color: string }> = {
  vulnerable: {
    label: "Rentan",
    cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]",
    color: "#F85149",
  },
  weak: {
    label: "Lemah",
    cls: "border-[#D29922]/40 bg-[#D29922]/10 text-[#D29922]",
    color: "#D29922",
  },
  secure: {
    label: "Aman",
    cls: "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]",
    color: "#3FB950",
  },
};

type OutcomeStyle = { label: string; cls: string; color: string };
const OUTCOME: Record<string, OutcomeStyle> = {
  exploited: {
    label: "Tereksploitasi",
    cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]",
    color: "#F85149",
  },
  bypassed: {
    label: "Lolos filter",
    cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]",
    color: "#F85149",
  },
  neutralized: {
    label: "Dinetralkan",
    cls: "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]",
    color: "#3FB950",
  },
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function isPipelineConfig(c: unknown): c is PipelineConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    Array.isArray(o.stages) &&
    o.stages.length >= 2 &&
    Array.isArray(o.payloads) &&
    o.payloads.length > 0 &&
    Array.isArray(o.variants) &&
    o.variants.length > 0
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-md border border-dashed border-[#21262D] p-4 text-xs text-[#8B949E]">
      {children}
    </div>
  );
}

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

// Split long stage labels onto two lines so they fit a narrow SVG.
function splitLabel(label: string): string[] {
  if (label.length <= 12 || !label.includes(" ")) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [label.slice(0, best), label.slice(best + 1)];
}

// Drawn as paths (not text glyphs) so they render the same on every device.
function Glyph({ kind }: { kind: "check" | "cross" | "bang" }) {
  const common = {
    stroke: "#0D1117",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    fill: "none",
  };
  if (kind === "check") return <path d="M-4 0 L-1 3.5 L4.5 -3" {...common} />;
  if (kind === "cross") return <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" {...common} />;
  return <path d="M0 -4.5 L0 1.5 M0 4.5 L0 4.6" {...common} />;
}

// Simple line icons for the pipeline stages (no image files needed).
function StageIcon({ kind, x, y, color }: { kind: string; x: number; y: number; color: string }) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      stroke={color}
      strokeWidth={1.5}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "user" && (
        <>
          <circle cx={0} cy={-5} r={4.5} />
          <path d="M-9 9 C-9 1 9 1 9 9" />
        </>
      )}
      {kind === "server" && (
        <>
          <rect x={-9} y={-10} width={18} height={8} rx={2} />
          <rect x={-9} y={2} width={18} height={8} rx={2} />
          <circle cx={-5} cy={-6} r={0.8} fill={color} />
          <circle cx={-5} cy={6} r={0.8} fill={color} />
        </>
      )}
      {kind === "database" && (
        <>
          <ellipse cx={0} cy={-7} rx={9} ry={3.5} />
          <path d="M-9 -7 V7 C-9 9.5 9 9.5 9 7 V-7" />
          <path d="M-9 0 C-9 2.5 9 2.5 9 0" />
        </>
      )}
      {kind === "bell" && (
        <>
          <path d="M-6 5 H6 C4.5 3.5 4 1 4 -2 A4 4 0 0 0 -4 -2 C-4 1 -4.5 3.5 -6 5 Z" />
          <path d="M-2 8 H2" />
        </>
      )}
      {kind === "browser" && (
        <>
          <rect x={-10} y={-8} width={20} height={16} rx={2} />
          <path d="M-10 -3 H10" />
        </>
      )}
      {!["user", "server", "database", "browser", "bell"].includes(kind) && (
        <rect x={-8} y={-8} width={16} height={16} rx={3} />
      )}
    </g>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Query assembly panel: the motion IS the lesson                      */
/*  - inline:   the attacker's text slides INTO the command            */
/*  - separate: the text travels in a sealed capsule, never merges     */
/* ------------------------------------------------------------------ */

const CHIP =
  "min-w-0 break-all rounded border border-[#F85149]/40 bg-[#F85149]/10 px-2 py-1 font-mono text-xs text-[#FF7B72]";

function QueryView({
  variant,
  payload,
  result,
  stages,
  assembled,
  token,
}: {
  variant: Variant;
  payload: Payload;
  result: Result | undefined;
  stages: Stage[];
  assembled: boolean;
  token: string;
}) {
  const q = variant.query;
  if (!q) return null;

  // Blocked before the last stage = the query was never even built.
  const stopIdx =
    result && result.stoppedAt !== null ? stages.findIndex((s) => s.id === result.stoppedAt) : -1;
  const blockedEarly = result?.outcome === "neutralized" && stopIdx >= 0 && stopIdx < stages.length - 1;
  const inlineParts = q.template.split("{input}");
  // "%s" is the placeholder of the parameterized (separate) mode.
  const sepParts = q.template.split("%s");

  const codeCls =
    "whitespace-pre-wrap break-words font-mono text-[13px] leading-6 text-[#C9D1D9] sm:text-sm";

  const trayGone = assembled && !blockedEarly;
  const tray = (
    <div
      className={`grid transition-[grid-template-rows,margin] duration-700 ease-in motion-reduce:transition-none ${
        trayGone ? "-mb-3 grid-rows-[0fr]" : "grid-rows-[1fr]"
      }`}
    >
      <div
        className={`flex items-center gap-2 transition-all duration-700 ease-in motion-reduce:transition-none ${
          trayGone ? "min-h-0 translate-y-7 opacity-0" : "min-h-9 opacity-100"
        }`}
      >
        <span className="shrink-0 text-xs text-[#8B949E]">Input penyerang</span>
        <span className={CHIP}>{payload.raw}</span>
        {blockedEarly && (
          <span className="inline-block h-7 w-3 shrink-0 rounded bg-[#3FB950]" aria-hidden="true" />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col rounded-lg border border-[#21262D] bg-[#161B22]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
        <span className="font-medium text-[#E6EDF3]">Query yang dirakit</span>
        <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[#F85149]">
          {payload.id.toUpperCase()}
        </span>
        <span>ketuk payload lain untuk mengganti</span>
      </div>

      {/* keyed by token so a new selection remounts at its start state */}
      <div key={token} className="flex flex-1 flex-col justify-center gap-3 p-4">
        {tray}

        {blockedEarly ? (
          <p className="text-sm leading-relaxed text-[#3FB950]">
            Ditolak di tahap {stages[stopIdx].label} sebelum query dibentuk. Tidak ada perintah
            yang sampai ke database.
          </p>
        ) : q.mode === "separate" ? (
          <>
            <div className={codeCls}>
              {sepParts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < sepParts.length - 1 && (
                    <span className="rounded border border-[#F0883E]/50 bg-[#F0883E]/10 px-1 text-[#F0883E]">
                      %s
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="rounded-md border border-dashed border-[#3FB950]/50 bg-[#3FB950]/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs text-[#3FB950]">
                <LockIcon />
                Dikirim terpisah sebagai data. Tidak pernah menjadi bagian dari perintah.
              </p>
              <div
                className={`flex min-h-9 items-center transition-all duration-700 ease-out motion-reduce:transition-none ${
                  assembled ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
                }`}
                style={{ transitionDelay: assembled ? "350ms" : "0ms" }}
              >
                <span className={CHIP}>{payload.raw}</span>
              </div>
            </div>
          </>
        ) : (
          <div className={codeCls}>
            {inlineParts.map((part, i) => (
              <span key={i}>
                {part}
                {i < inlineParts.length - 1 && (
                  <span
                    className={`rounded outline outline-dashed box-decoration-clone transition-all duration-700 ease-out motion-reduce:transition-none ${
                      assembled
                        ? "bg-[#F85149]/25 text-[#FF7B72] outline-transparent"
                        : "bg-[#F85149]/0 text-transparent outline-[#F85149]/60"
                    }`}
                    style={{ transitionDelay: assembled ? "350ms" : "0ms" }}
                  >
                    {payload.raw}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {q.note && !blockedEarly && (
          <p className="border-t border-[#21262D] pt-3 text-sm leading-relaxed text-[#C9D1D9]">{q.note}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline renderer                                                   */
/* ------------------------------------------------------------------ */

const W = 360; // SVG user units. Sized for a phone; scales up on desktop.
const LANE_H = 38;
const TOP = 74;
const X_FIRST = 56;
const X_LAST = 304;
const STAGGER_MS = 250;
const MARKER_DELAY_MS = 950; // packet transition is duration-1000
const STEP_MS = 9000; // autoplay: how long the tour stays on each step

function PipelineSimulation({ config }: { config: PipelineConfig }) {
  const { stages, payloads, variants } = config;
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
    setPinned(pinnedId); // keep whatever payload is currently in focus
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
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const n = stages.length;
  const xs = stages.map((_, i) => X_FIRST + (i * (X_LAST - X_FIRST)) / (n - 1));
  const H = TOP + payloads.length * LANE_H + 6;
  const tag = TAG[variant.tag] ?? TAG.weak;

  // Which payload the query panel shows: the one picked (or the tour's), else
  // the first payload that got through, which is the interesting one.
  const autoFocusId =
    payloads.find((p) => {
      const r = variant.results[p.id];
      return r && r.outcome !== "neutralized";
    })?.id ?? payloads[0].id;
  const focusId = pinnedId && payloads.some((p) => p.id === pinnedId) ? pinnedId : autoFocusId;
  const focusPayload = payloads.find((p) => p.id === focusId) ?? payloads[0];

  // Lanes replay when the implementation changes; the query panel also
  // replays when a different payload is focused.
  const go = useArrived(`${variant.id}:${runKey}`, seen);
  const asmToken = `${variant.id}:${focusId}:${runKey}`;
  const assembled = useArrived(asmToken, seen);
  const laneToken = `${variant.id}:${runKey}`;

  // Score for the verdict banner, derived from the results (no extra data).
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
  const codeLines = variant.code.split("\n").map((line) => ({
    text: line,
    changed: variant.id !== variants[0].id && line.trim() !== "" && !baseLines.has(line.trim()),
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
            Pilih implementasi, lalu lihat apa yang terjadi
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

      {/* Guided tour: one narrated step at a time */}
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

      {/* Code + query assembly (left)  |  payload journey (right) */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-6">
          <div
            className="overflow-hidden rounded-lg border border-[#21262D] bg-[#161B22]"
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

          {variant.query && (
            <div className="min-h-0 flex-1">
              <QueryView
                variant={variant}
                payload={focusPayload}
                result={variant.results[focusPayload.id]}
                stages={stages}
                assembled={assembled}
                token={asmToken}
              />
            </div>
          )}
        </div>

        <div ref={animRef} className="min-w-0 rounded-lg border border-[#21262D] bg-[#161B22] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[#E6EDF3]">{L.journey}</span>
            <button
              type="button"
              onClick={() => setRunKey((k) => k + 1)}
              className="rounded border border-[#21262D] px-3 py-2 text-xs text-[#8B949E] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
            >
              Putar ulang
            </button>
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mx-auto h-auto w-full max-w-md"
            role="img"
            aria-label={L.ariaJourney}
          >
            {/* stage icons, columns and labels */}
            {stages.map((s, i) => {
              const lines = splitLabel(s.label);
              const kind = s.icon ?? (i === 0 ? "user" : i === n - 1 ? "database" : "server");
              const lit = step?.stage === s.id;
              const tone = lit ? "#F0883E" : "#8B949E";
              return (
                <g key={s.id}>
                  {lit && (
                    <circle
                      cx={xs[i]}
                      cy={20}
                      r={16}
                      fill="#F0883E"
                      fillOpacity={0.12}
                      stroke="#F0883E"
                      strokeOpacity={0.6}
                    />
                  )}
                  <StageIcon kind={kind} x={xs[i]} y={20} color={tone} />
                  {lines.map((line, k) => (
                    <text
                      key={k}
                      x={xs[i]}
                      y={lines.length === 1 ? 52 : 46 + k * 13}
                      textAnchor="middle"
                      fontSize="11"
                      fill={tone}
                    >
                      {line}
                    </text>
                  ))}
                  <line
                    x1={xs[i]}
                    x2={xs[i]}
                    y1={64}
                    y2={H - 4}
                    stroke={lit ? "#F0883E" : "#30363D"}
                    strokeOpacity={lit ? 0.7 : 1}
                    strokeDasharray="3 4"
                  />
                </g>
              );
            })}

            {/* lanes */}
            {payloads.map((p, i) => {
              const res = variant.results[p.id];
              const o: OutcomeStyle | undefined = res ? OUTCOME[res.outcome] : undefined;
              const y = TOP + i * LANE_H + LANE_H / 2;
              const focused = p.id === focusId;
              const dim = step !== null && !focused; // tour spotlights one payload

              let endIdx = 0;
              if (res) {
                const idx =
                  res.stoppedAt === null ? n - 1 : stages.findIndex((s) => s.id === res.stoppedAt);
                endIdx = idx >= 0 ? idx : n - 1;
              }
              const endX = xs[endIdx];
              const neutralized = res?.outcome === "neutralized";
              const blockedEarly = neutralized && endIdx < n - 1;
              const glyph = neutralized ? (blockedEarly ? "cross" : "check") : "bang";
              const arriveDelay = `${i * STAGGER_MS + MARKER_DELAY_MS}ms`;
              const packetColor = go && neutralized ? "#3FB950" : "#F85149";

              return (
                <g
                  key={p.id}
                  onClick={() => pickPayload(p.id)}
                  className="transition-opacity duration-300 motion-reduce:transition-none"
                  style={{ cursor: "pointer", opacity: dim ? 0.35 : 1 }}
                >
                  {/* clickable band, outlined for the focused payload */}
                  <rect
                    x={4}
                    y={y - LANE_H / 2 + 2}
                    width={W - 8}
                    height={LANE_H - 4}
                    rx={7}
                    fill="transparent"
                    stroke={focused ? "#F0883E" : "none"}
                    strokeOpacity={0.55}
                  />
                  <line x1={xs[0]} x2={xs[n - 1]} y1={y} y2={y} stroke="#30363D" />

                  <g
                    key={`${laneToken}:${p.id}`}
                    className="transition-transform duration-1000 ease-out motion-reduce:transition-none"
                    style={{
                      transform: `translate(${go ? endX : xs[0]}px, ${y}px)`,
                      transitionDelay: `${i * STAGGER_MS}ms`,
                    }}
                  >
                    <rect
                      x={-18}
                      y={-11}
                      width={36}
                      height={22}
                      rx={6}
                      fillOpacity={0.18}
                      className="transition-[fill,stroke] duration-300 motion-reduce:transition-none"
                      style={{ fill: packetColor, stroke: packetColor, transitionDelay: arriveDelay }}
                    />
                    <text
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize="11"
                      fontFamily="monospace"
                      className="transition-[fill] duration-300 motion-reduce:transition-none"
                      style={{ fill: packetColor, transitionDelay: arriveDelay }}
                    >
                      {p.id.toUpperCase()}
                    </text>
                  </g>

                  {res && o && (
                    <g
                      key={`m:${laneToken}:${p.id}`}
                      className="transition-opacity duration-300 motion-reduce:transition-none"
                      style={{ opacity: go ? 1 : 0, transitionDelay: arriveDelay }}
                    >
                      <g transform={`translate(${endX + 30} ${y})`}>
                        {blockedEarly ? (
                          <rect x={-9} y={-14} width={18} height={28} rx={5} fill={o.color} />
                        ) : (
                          <>
                            {!neutralized && (
                              <circle
                                r={9}
                                fill={o.color}
                                className="animate-ping motion-reduce:animate-none"
                                style={{
                                  transformBox: "fill-box",
                                  transformOrigin: "center",
                                  animationIterationCount: 3,
                                  animationDelay: arriveDelay,
                                }}
                              />
                            )}
                            <circle r={9} fill={o.color} />
                          </>
                        )}
                        <Glyph kind={glyph} />
                      </g>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Verdict: the main lesson, full width */}
      <div
        aria-live="polite"
        className="flex flex-col gap-4 rounded-lg border border-[#21262D] bg-[#161B22] p-5 lg:flex-row lg:items-start lg:gap-8"
        style={{ borderLeft: `4px solid ${tag.color}` }}
      >
        <div className="flex flex-wrap items-center gap-3 lg:w-72 lg:shrink-0 lg:flex-col lg:items-start">
          <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${tag.cls}`}>
            {tag.label}
          </span>
          {scoreText && (
            <span className="text-base font-semibold" style={{ color: scoreColor }}>
              {scoreText}
            </span>
          )}
        </div>
        <p className="min-w-0 flex-1 text-base leading-relaxed text-[#E6EDF3]">
          {variant.explanation}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start">
        {/* Comparison matrix: fills in as the learner tries each implementation */}
        <div className="min-w-0 lg:col-start-1">
          <p className="mb-2 text-sm font-medium text-[#E6EDF3]">
            Perbandingan implementasi{" "}
            <span className="font-normal text-[#8B949E]">
              (terisi saat kamu mencoba tiap pilihan)
            </span>
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
                    const o: OutcomeStyle | undefined = r ? OUTCOME[r.outcome] : undefined;
                    return (
                      <span key={p.id} className="flex justify-center">
                        {tried && o ? (
                          <>
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full"
                              style={{ background: o.color }}
                            />
                            <span className="sr-only">{r?.label ?? o.label}</span>
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

        {/* Payloads: tap to focus + see how each one works */}
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <p className="mb-2 text-sm font-medium text-[#E6EDF3]">
            {L.list} <span className="font-normal text-[#8B949E]">{L.listHint}</span>
          </p>
          <ul className="space-y-2">
            {payloads.map((p) => {
              const res = variant.results[p.id];
              const o: OutcomeStyle | undefined = res ? OUTCOME[res.outcome] : undefined;
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
                    <code className="min-w-0 flex-1 break-all font-mono text-sm text-[#F0883E]">
                      {p.raw}
                    </code>
                    <span aria-hidden="true" className="shrink-0 text-base text-[#8B949E]">
                      {open ? "−" : "+"}
                    </span>
                  </button>

                  <div className="space-y-2 px-3.5 pb-3.5">
                    {res && o ? (
                      <>
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${o.cls}`}
                        >
                          {res.label ?? o.label}
                        </span>
                        <p className="text-sm leading-relaxed text-[#C9D1D9]">{res.reason}</p>
                      </>
                    ) : (
                      <p className="text-sm text-[#8B949E]">
                        Hasil untuk payload ini belum tersedia di implementasi ini.
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
                  <div
                    key={i}
                    className="flex gap-3 rounded-lg border border-[#21262D] bg-[#161B22] p-4"
                  >
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

/* ------------------------------------------------------------------ */
/* Entry point: picks the renderer by template                         */
/* ------------------------------------------------------------------ */

export default function SimulationEmbed({ sim }: { sim: SimulationRow | undefined }) {
  if (!sim) return <Notice>Simulasi tidak ditemukan.</Notice>;

  if (sim.template === "pipeline" && isPipelineConfig(sim.config)) {
    return <PipelineSimulation config={sim.config} />;
  }

  if (sim.template === "logfile" && isLogConfig(sim.config)) {
    return <LogFileSimulation config={sim.config} />;
  }
  if (sim.template === "entropy" && isEntropyConfig(sim.config)) {
  return <EntropySimulation config={sim.config} />;
}
if (sim.template === "deptree" && isDepTreeConfig(sim.config)) {
  return <DepTreeSimulation config={sim.config} />;
} 
if (sim.template === "boundary" && isBoundaryConfig(sim.config)) {
  return <BoundarySimulation config={sim.config} />;
}
  if (sim.template === "fault" && isFaultConfig(sim.config)) {
    return <FaultSimulation config={sim.config} />;
  }

  return <Notice>Simulasi ini belum bisa ditampilkan (template belum didukung atau data tidak valid).</Notice>;
}
