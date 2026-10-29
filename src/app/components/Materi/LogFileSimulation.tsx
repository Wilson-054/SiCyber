"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Template "logfile": a mock log file where attacker text is visible  */
/* Same variant/tour/rules model as the pipeline template.             */
/* ------------------------------------------------------------------ */

type Outcome = "exploited" | "bypassed" | "neutralized";
type Tag = "vulnerable" | "weak" | "secure";

type Part = { t: string; src: "app" | "user" };
type LogLine = { parts: Part[]; forged?: boolean; note?: string };
// What a web log viewer shows. raw = browser interprets it, encoded = plain text.
type Viewer = { mode: "raw" | "encoded"; prefix?: string; text: string; live?: string };
type LogResult = {
  outcome: Outcome;
  label?: string;
  reason: string;
  lines: LogLine[];
  viewer?: Viewer;
};
type Payload = { id: string; raw: string; explains: string };
type Variant = {
  id: string;
  tag: Tag;
  label: string;
  // Optional short wording for the filter badge on the logger node.
  // Falls back to `label` for non-vulnerable variants.
  filter?: string;
  code: string;
  explanation: string;
  results: Record<string, LogResult | undefined>;
};
type TourStep = { variant: string; focus?: string; caption: string };
type Rule = { title: string; text: string; proof: string };
type Labels = {
  file?: string;
  list?: string;
  listHint?: string;
  detail?: string;
  allSafe?: string;
  someBad?: string;
  legendBad?: string;
  legendGood?: string;
};
export type LogConfig = {
  payloads: Payload[];
  variants: Variant[];
  tour?: TourStep[];
  rules?: Rule[];
  labels?: Labels;
};

const DEFAULT_LABELS: Required<Labels> = {
  file: "Isi file log",
  list: "Input penyerang",
  listHint: "(ketuk untuk detail)",
  detail: "Cara kerja input",
  allSafe: "Semua {total} input tidak merusak log",
  someBad: "{n} dari {total} input berhasil merusak log",
  legendBad: "log rusak atau menyesatkan",
  legendGood: "log tetap utuh",
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

const STEP_MS = 9000;

export function isLogConfig(c: unknown): c is LogConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    Array.isArray(o.payloads) &&
    o.payloads.length > 0 &&
    Array.isArray(o.variants) &&
    o.variants.length > 0 &&
    (o.variants as Variant[]).every((v) => v && typeof v.results === "object" && v.results !== null)
  );
}

/* ------------------------------------------------------------------ */
/* Animation phases, shared by the pipeline strip and the log rows so  */
/* the packet visibly arrives before the lines appear.                 */
/*   0 packet waits at the input                                       */
/*   1 packet travels to the logger                                    */
/*   2 at the logger: filter badge, split or clip                      */
/*   3 packet travels to the log file                                  */
/*   4 at the file: rows fade in                                       */
/*   5 hop to the web viewer (only when the result has a viewer)       */
/* A new token starts over at phase 0.                                 */
/* ------------------------------------------------------------------ */
function usePipelinePhase(token: string, enabled: boolean, lineCount: number, hasViewer: boolean) {
  const [state, setState] = useState({ token: "", phase: 0 });
  useEffect(() => {
    if (!enabled) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setState({ token, phase: hasViewer ? 5 : 4 });
      return;
    }
    const at = [50, 950, 1900, 2700]; // when phases 1..4 begin
    const timers = at.map((ms, i) => setTimeout(() => setState({ token, phase: i + 1 }), ms));
    if (hasViewer) {
      timers.push(setTimeout(() => setState({ token, phase: 5 }), 2700 + lineCount * 500 + 700));
    }
    return () => timers.forEach(clearTimeout);
  }, [token, enabled, lineCount, hasViewer]);
  return enabled && state.token === token ? state.phase : 0;
}

const CHIP = "rounded bg-[#F85149]/20 px-0.5 text-[#FF7B72]";

/* ------------------------------------------------------------------ */
/* Pipeline strip: input -> logger -> log file -> web viewer           */
/* ------------------------------------------------------------------ */
const NODE_X = [12.5, 37.5, 62.5, 87.5]; // node centres, % of the strip width

function PipelineStrip({
  raw,
  res,
  variant,
  phase,
  truth,
}: {
  raw: string;
  res: LogResult | undefined;
  variant: Variant;
  phase: number;
  truth: boolean;
}) {
  const lines = res?.lines ?? [];
  const forged = lines.filter((l) => l.forged);
  const bad = !!res && res.outcome !== "neutralized";
  const longInput = lines.some((l) => !!l.note);
  const hasViewer = !!res?.viewer;
  const filterLabel = variant.tag === "vulnerable" ? null : (variant.filter ?? variant.label);
  const mainParts = lines[0]?.parts ?? [];

  const packetX =
    phase >= 5 && hasViewer ? NODE_X[3] : phase >= 3 ? NODE_X[2] : phase >= 1 ? NODE_X[1] : NODE_X[0];
  const forgedX = phase >= 3 ? NODE_X[2] : NODE_X[1];
  const progress = ((packetX - NODE_X[0]) / (NODE_X[3] - NODE_X[0])) * 100;

  const active = [
    phase <= 1,
    phase === 2,
    phase >= 4 && !(phase >= 5 && hasViewer),
    phase >= 5 && hasViewer,
  ];

  const move = "transition-[left] duration-[800ms] ease-in-out motion-reduce:transition-none";
  const fade = "transition-opacity duration-500 motion-reduce:transition-none";
  const nodeBase =
    "flex min-h-[5rem] min-w-0 flex-col items-center gap-1 rounded-md border bg-[#0D1117] px-1 py-2 text-center transition-colors duration-300 motion-reduce:transition-none";
  const nodeCls = (i: number) =>
    `${nodeBase} ${active[i] ? "border-[#F0883E]/70" : "border-[#21262D]"}`;

  return (
    <div className="rounded-lg border border-[#21262D] bg-[#161B22] p-3" aria-hidden="true">
      <p className="mb-2 text-xs font-medium text-[#8B949E]">Perjalanan input sampai ke log</p>

      {/* Track: line, progress, packets */}
      <div className="relative h-[3.25rem]">
        <div className="absolute top-3 h-px bg-[#21262D]" style={{ left: `${NODE_X[0]}%`, right: `${100 - NODE_X[3]}%` }} />
        <div
          className="absolute top-3 h-px bg-[#F0883E] transition-[width] duration-[800ms] ease-in-out motion-reduce:transition-none"
          style={{ left: `${NODE_X[0]}%`, width: `${progress * 0.75}%` }}
        />
        {NODE_X.map((x, i) => (
          <span
            key={i}
            className="absolute top-3 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-300"
            style={{ left: `${x}%`, background: packetX >= x ? "#F0883E" : "#21262D" }}
          />
        ))}

        {/* Main packet */}
        <div className={`absolute top-0 -translate-x-1/2 ${move}`} style={{ left: `${packetX}%` }}>
          {phase < 2 ? (
            <span
              className="block truncate rounded border border-[#F85149]/50 bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-[#FF7B72]"
              style={{ maxWidth: longInput ? "9rem" : "6rem" }}
            >
              {raw}
            </span>
          ) : (
            <span
              className="flex items-center overflow-hidden rounded border border-[#30363D] bg-[#0D1117] px-1 py-0.5 font-mono text-[10px] leading-4 text-[#8B949E]"
              style={{ maxWidth: longInput && bad ? "10rem" : "7rem" }}
            >
              {mainParts.map((p, k) =>
                p.src === "user" ? (
                  <span key={k} className={`max-w-[5rem] truncate ${truth ? CHIP : "text-[#C9D1D9]"}`}>
                    {p.t}
                  </span>
                ) : (
                  <span key={k} className="max-w-[2.5rem] shrink-0 truncate">
                    {p.t}
                  </span>
                ),
              )}
              {longInput && !bad && <span className="ml-1 shrink-0 text-[#3FB950]">✂</span>}
            </span>
          )}
        </div>

        {/* Extra packets: the forged lines that leave the logger */}
        {forged.map((l, i) => (
          <div
            key={i}
            className={`absolute -translate-x-1/2 ${move} ${fade} ${phase >= 2 ? "opacity-100" : "opacity-0"}`}
            style={{ left: `${forgedX}%`, top: `${1.75 + i * 1.5}rem` }}
          >
            <span
              className={`block max-w-[7rem] truncate rounded border px-1.5 py-0.5 font-mono text-[10px] leading-4 ${
                truth
                  ? "border-[#F85149]/60 bg-[#F85149]/15 text-[#FF7B72]"
                  : "border-[#30363D] bg-[#0D1117] text-[#8B949E]"
              }`}
            >
              {l.parts.map((p) => p.t).join("")}
            </span>
          </div>
        ))}
      </div>

      {/* Nodes */}
      <div className="grid grid-cols-4 gap-2 text-[11px] leading-tight">
        <div className={nodeCls(0)}>
          <span className="font-medium text-[#E6EDF3]">Input</span>
          <span className="text-[#8B949E]">penyerang</span>
        </div>

        <div className={nodeCls(1)}>
          <span className="font-medium text-[#E6EDF3]">Logger</span>
          <span className={`flex min-w-0 max-w-full flex-col items-center gap-1 ${fade} ${phase >= 2 ? "opacity-100" : "opacity-0"}`}>
            {filterLabel ? (
              <span
                title={filterLabel}
                className={`max-w-full truncate rounded border px-1 text-[10px] ${
                  bad
                    ? "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]"
                    : "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]"
                }`}
              >
                {filterLabel}
              </span>
            ) : (
              <span className="text-[10px] text-[#8B949E]">tanpa filter</span>
            )}
            {lines.length > 1 && truth && (
              <span className="font-semibold text-[#F85149]">1 → {lines.length} baris</span>
            )}
            {longInput && !bad && <span className="text-[#3FB950]">dipotong</span>}
          </span>
        </div>

        <div className={nodeCls(2)}>
          <span className="font-medium text-[#E6EDF3]">File log</span>
          <span className={`flex w-full flex-col items-center gap-1 px-1 ${fade} ${phase >= 4 ? "opacity-100" : "opacity-0"}`}>
            {longInput ? (
              <>
                <span className="h-1.5 w-full overflow-hidden rounded bg-[#21262D]">
                  <span
                    className="block h-full rounded transition-[width] duration-700 motion-reduce:transition-none"
                    style={{
                      width: phase >= 4 ? (bad ? "100%" : "25%") : "0%",
                      background: bad ? "#F85149" : "#3FB950",
                    }}
                  />
                </span>
                <span style={{ color: bad ? "#F85149" : "#3FB950" }}>{bad ? "membengkak" : "terbatas"}</span>
              </>
            ) : (
              <>
                <span className="flex w-full flex-col gap-0.5">
                  {lines.map((l, i) => (
                    <span
                      key={i}
                      className="h-1 rounded transition-all duration-500 motion-reduce:transition-none"
                      style={{
                        background: truth && l.forged ? "#F85149" : "#8B949E",
                        opacity: phase >= 4 ? 1 : 0,
                        transform: phase >= 4 ? "translateX(0)" : "translateX(-6px)",
                        transitionDelay: phase >= 4 ? `${i * 500}ms` : "0ms",
                      }}
                    />
                  ))}
                </span>
                <span className="text-[#8B949E]">{lines.length} baris</span>
              </>
            )}
          </span>
        </div>

        <div className={`${nodeCls(3)} ${hasViewer ? "" : "opacity-40"}`}>
          <span className="font-medium text-[#E6EDF3]">Viewer</span>
          {hasViewer && res?.viewer ? (
            <span className={`${fade} ${phase >= 5 ? "opacity-100" : "opacity-50"}`}>
              {phase >= 5 ? (
                res.viewer.mode === "raw" ? (
                  <span className="font-semibold text-[#F85149]">⚠ HTML aktif</span>
                ) : (
                  <span className="font-semibold text-[#3FB950]">teks aman</span>
                )
              ) : (
                <span className="text-[#8B949E]">menunggu</span>
              )}
            </span>
          ) : (
            <span className="text-[#8B949E]">tidak dipakai</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LogFileSimulation({ config }: { config: LogConfig }) {
  const { payloads, variants } = config;
  const L = { ...DEFAULT_LABELS, ...(config.labels ?? {}) };

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
  const [truth, setTruth] = useState(true); // false = "seen by the analyst"
  const animRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

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
    setTruth(true);
    setVisited((prev) => new Set(prev).add(s.variant));
  }
  function startTour() {
    setSeen(true);
    setVisited(new Set([tour[0].variant]));
    setRunKey((k) => k + 1);
    goStep(0);
  }

  useEffect(() => {
    if (tourStep === null || !autoplay) return;
    const t = setTimeout(() => {
      if (tourStep >= tour.length - 1) {
        setAutoplay(false);
        return;
      }
      goStep(tourStep + 1);
    }, STEP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, autoplay, tour]);

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
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const tag = TAG[variant.tag] ?? TAG.weak;

  // Focus: the picked payload, else the first one that hurt (the interesting one).
  const autoFocusId =
    payloads.find((p) => {
      const r = variant.results[p.id];
      return r && r.outcome !== "neutralized";
    })?.id ?? payloads[0].id;
  const focusId = pinnedId && payloads.some((p) => p.id === pinnedId) ? pinnedId : autoFocusId;
  const focus = payloads.find((p) => p.id === focusId) ?? payloads[0];
  const res = variant.results[focus.id];
  const o = res ? OUTCOME[res.outcome] : undefined;
  const lines = res?.lines ?? [];

  const token = `${variant.id}:${focusId}:${runKey}`;
  const phase = usePipelinePhase(token, seen, lines.length, !!res?.viewer);
  const arrived = phase >= 4; // packet reached the log file: rows fade in
  const viewerArrived = phase >= 5 || !res?.viewer; // packet hopped to the viewer

  const known = payloads.filter((p) => variant.results[p.id]);
  const through = known.filter((p) => variant.results[p.id]?.outcome !== "neutralized").length;
  const scoreColor = through === 0 ? "#3FB950" : through === known.length ? "#F85149" : "#D29922";
  const scoreText =
    known.length === 0
      ? ""
      : (through === 0 ? L.allSafe : L.someBad)
          .replace("{n}", String(through))
          .replace("{total}", String(known.length));

  const baseLines = new Set(variants[0].code.split("\n").map((l) => l.trim()));
  const codeLines = variant.code.split("\n").map((text) => ({
    text,
    changed: variant.id !== variants[0].id && text.trim() !== "" && !baseLines.has(text.trim()),
  }));
  const hasChanged = codeLines.some((l) => l.changed);

  const forgedCount = lines.filter((l) => l.forged).length;
  const matrixCols = { gridTemplateColumns: `1fr repeat(${payloads.length}, 2rem)` };
  const navBtn =
    "rounded-md border px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      aria-label="Simulasi interaktif"
      className="my-10 space-y-6 lg:relative lg:left-1/2 lg:w-[min(68rem,calc(100vw_-_4rem))] lg:-translate-x-1/2"
    >
      {/* Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-[#E6EDF3]">
            Pilih implementasi, lalu lihat apa yang terjadi pada log
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
              <span key={i} className={`h-1.5 flex-1 rounded ${i <= tourStep ? "bg-[#F0883E]" : "bg-[#21262D]"}`} />
            ))}
          </div>
          {autoplay && (
            <div className="mt-1.5 h-0.5 overflow-hidden rounded bg-[#21262D]" aria-hidden="true">
              <div ref={barRef} key={tourStep} className="h-full w-0 bg-[#F0883E]/70" />
            </div>
          )}
        </div>
      )}

      {/* Code (left)  |  pipeline + log file + viewer (right) */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div
          className="min-w-0 overflow-hidden rounded-lg border border-[#21262D] bg-[#161B22]"
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

        <div ref={animRef} className="min-w-0 space-y-4">
          <PipelineStrip raw={focus.raw} res={res} variant={variant} phase={phase} truth={truth} />

          <div className="rounded-lg border border-[#21262D] bg-[#161B22]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
              <span className="flex items-center gap-2">
                <span className="font-medium text-[#E6EDF3]">{L.file}</span>
                <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[#F85149]">
                  {focus.id.toUpperCase()}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={truth}
                  onClick={() => setTruth((t) => !t)}
                  className="rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#8B949E] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
                >
                  {truth ? "Lihat seperti analis" : "Tampilkan yang sebenarnya"}
                </button>
                <button
                  type="button"
                  onClick={() => setRunKey((k) => k + 1)}
                  className="rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#8B949E] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
                >
                  Putar ulang
                </button>
              </span>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-[#8B949E]">Input penyerang</span>
                <span className="min-w-0 break-all rounded border border-[#F85149]/40 bg-[#F85149]/10 px-2 py-1 font-mono text-[#FF7B72]">
                  {focus.raw}
                </span>
              </div>

              <p
                className="text-xs"
                style={{ color: forgedCount > 0 ? "#F85149" : "#8B949E" }}
                aria-live="polite"
              >
                Aplikasi memanggil logger 1 kali. File log memuat {lines.length} baris.
                {forgedCount > 0 && truth ? ` ${forgedCount} di antaranya palsu.` : ""}
              </p>

              <div className="overflow-hidden rounded-md border border-[#21262D] bg-[#0D1117] py-2">
                {lines.length === 0 && (
                  <p className="px-3 py-2 text-sm text-[#8B949E]">Hasil untuk input ini belum tersedia.</p>
                )}
                {lines.map((l, i) => (
                  <div
                    key={`${token}:${i}`}
                    className={`flex gap-3 border-l-2 px-3 py-1 font-mono text-[13px] leading-6 transition-all duration-500 motion-reduce:transition-none ${
                      arrived ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
                    } ${truth && l.forged ? "border-[#F85149] bg-[#F85149]/10" : "border-transparent"}`}
                    style={{ transitionDelay: arrived ? `${i * 500 + 150}ms` : "0ms" }}
                  >
                    <span className="w-4 shrink-0 select-none text-right text-[#8B949E]">{i + 1}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-[#C9D1D9]">
                      {l.parts.map((p, k) => (
                        <span key={k} className={truth && p.src === "user" ? CHIP : ""}>
                          {p.t}
                        </span>
                      ))}
                      {l.note && <span className="ml-2 text-xs text-[#8B949E]">({l.note})</span>}
                    </span>
                    {truth && l.forged && (
                      <span className="h-fit shrink-0 rounded-full border border-[#F85149]/40 bg-[#F85149]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F85149]">
                        PALSU
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {!truth && forgedCount > 0 && (
                <p className="text-xs leading-relaxed text-[#D29922]">
                  Dari sini, baris palsu tidak bisa dibedakan dari catatan asli. Analis maupun alat otomatis akan
                  mengira kejadian itu nyata.
                </p>
              )}

              {res?.viewer && (
                <div className="rounded-md border border-[#21262D] bg-[#0D1117]">
                  <div className="border-b border-[#21262D] px-3 py-1.5 text-xs text-[#8B949E]">
                    Tampilan di web log viewer ·{" "}
                    <span style={{ color: res.viewer.mode === "raw" ? "#F85149" : "#3FB950" }}>
                      {res.viewer.mode === "raw" ? "teks mentah" : "di-encode"}
                    </span>
                  </div>
                  <div className="p-3 font-mono text-[13px] leading-6 text-[#C9D1D9]">
                    {res.viewer.mode === "raw" ? (
                      <>
                        <span>{res.viewer.prefix}</span>
                        <span
                          key={`${token}:viewer`}
                          className={`inline-block rounded border border-[#F85149]/50 bg-[#F85149]/15 px-2 py-0.5 text-xs text-[#FF7B72] transition-all duration-500 motion-reduce:transition-none ${
                            viewerArrived ? "scale-100 opacity-100" : "scale-90 opacity-0"
                          }`}
                          style={{ transitionDelay: viewerArrived ? "150ms" : "0ms" }}
                        >
                          ⚠ elemen HTML aktif
                        </span>
                        {res.viewer.live && (
                          <p className="mt-2 font-sans text-xs text-[#F85149]">{res.viewer.live}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="break-all">
                          {res.viewer.prefix}
                          {res.viewer.text}
                        </span>
                        <p className="mt-2 font-sans text-xs text-[#3FB950]">
                          Tampil apa adanya sebagai teks. Tidak ada yang dieksekusi.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {res && o && (
                <div className="space-y-1.5">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${o.cls}`}>
                    {res.label ?? o.label}
                  </span>
                  <p className="text-sm leading-relaxed text-[#C9D1D9]">{res.reason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Verdict */}
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
        {/* Matrix */}
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

        {/* Payload list */}
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
                  className={`rounded-lg border bg-[#161B22] ${focused ? "border-[#F0883E]/50" : "border-[#21262D]"}`}
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
                    <code className="min-w-0 flex-1 break-all font-mono text-sm text-[#F0883E]">{p.raw}</code>
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
                      <p className="text-sm text-[#8B949E]">Hasil untuk input ini belum tersedia di implementasi ini.</p>
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

        {/* Rules */}
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