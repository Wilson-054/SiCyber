"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Types (mirror the JSON in simulations.config, template = "boundary") */
/* ------------------------------------------------------------------ */

type Outcome = "exploited" | "bypassed" | "neutralized";
type Tag = "vulnerable" | "weak" | "secure";

type VizKind = "zones" | "dump" | "filename" | "route" | "steps";
// A guard is something the design can put on the boundary.
type Guard = { id: string; label: string };
// Data crossing a boundary: what travels, where it lands, what it changes.
type Zone = {
  chip: { label: string; value: string };
  field: string; // the thing in the trusted zone that could change
  before?: string;
  landed: string; // what the field becomes when the data gets through
  fromLabel?: string;
  toLabel?: string;
};
type FileSeg = { t: string; k: "base" | "decoy" | "real" | "junk" };
// Data that is sent to the wrong place when a loaded script or mapping is hostile.
type Route = {
  from: string; // who sends
  via: string; // the thing that can reroute it (a script, a subdomain mapping)
  data: string; // what travels
  app: string; // the intended destination
  evil: string; // where it ends up when rerouted
  change: string; // what the hostile part changes
};
// Raw data handed over before it is processed, with one caption per outcome.
type Blob = { label: string; text: string; bad?: string; good?: string };
// A scenario (kept under the key `payloads` so seeds look like the old format).
type Payload = {
  id: string;
  raw: string;
  explains: string;
  viz?: VizKind;
  guard?: string; // the guard that should stop this scenario
  zone?: Zone;
  file?: { name: string; segs: FileSeg[] };
  route?: Route;
  blob?: Blob;
};
type Step = { title: string; text: string; tone: "bad" | "ok" | "stop" | "skip" };
type DumpRow = { user: string; stored: string; read: string };
type Result = {
  outcome: Outcome;
  reason: string;
  label?: string;
  // Which guard stopped it. Missing means the data got through the gate.
  stoppedBy?: string;
  steps?: Step[];
  dump?: { mode: "plain" | "decode" | "match" | "opaque"; rows: DumpRow[]; note: string };
};
type Variant = {
  id: string;
  tag: Tag;
  label: string;
  code: string;
  explanation: string;
  guards: string[]; // ids of the guards this implementation has
  results: Record<string, Result | undefined>;
};
type TourStep = { variant: string; focus?: string; stage?: string; caption: string };
type Rule = { title: string; text: string; proof: string };

const DEFAULT_LABELS = {
  list: "Skenario",
  listHint: "(ketuk untuk detail)",
  detail: "Latar skenario",
  allSafe: "Semua {total} skenario berhasil ditahan",
  someBad: "{n} dari {total} skenario berujung bahaya",
  legendBad: "berujung bahaya",
  legendGood: "aman / diterima dengan sah",
  guardTitle: "Penjaga di gerbang",
  guardHint: "ketuk skenario lain untuk mengganti",
  present: "ada",
  absent: "tidak ada",
  stopsThis: "menahan skenario ini",
  shouldStop: "seharusnya menahan ini",
  vizTitle: "Cara kerja serangan",
  vizHint: "ketuk skenario lain untuk mengganti",
  disclaimer:
    "Visualisasi ini menggambarkan konsep, bukan simulasi sistem nyata. Nilai dan nama file hanya contoh.",
};
type Labels = Partial<typeof DEFAULT_LABELS>;

export type BoundaryConfig = {
  guards: Guard[];
  payloads: Payload[];
  variants: Variant[];
  tour?: TourStep[];
  rules?: Rule[];
  labels?: Labels;
};

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

const RED = "#F85149";
const GREEN = "#3FB950";

export function isBoundaryConfig(c: unknown): c is BoundaryConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    Array.isArray(o.guards) &&
    Array.isArray(o.payloads) &&
    o.payloads.length > 0 &&
    Array.isArray(o.variants) &&
    o.variants.length > 0
  );
}

/* ------------------------------------------------------------------ */
/* Animation helpers                                                   */
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

// Counts 0..max, one step every `ms`, once `run` is true. Restarts on a new
// token. With reduced motion it jumps straight to the end state.
function useTicker(token: string, run: boolean, ms: number, max: number) {
  const [st, setSt] = useState({ token: "", n: 0 });
  useEffect(() => {
    if (!run) return;
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSt({ token, n: max });
      return;
    }
    let n = 0;
    setSt({ token, n: 0 });
    const id = setInterval(() => {
      n += 1;
      setSt({ token, n });
      if (n >= max) clearInterval(id);
    }, ms);
    return () => clearInterval(id);
  }, [token, run, ms, max]);
  return st.token === token ? st.n : 0;
}

/* ------------------------------------------------------------------ */
/* Panel 1: guards on the boundary                                     */
/* ------------------------------------------------------------------ */

type PanelProps = {
  variant: Variant;
  guards: Guard[];
  payload: Payload;
  result: Result | undefined;
  token: string;
  run: boolean;
  L: Required<Labels>;
};

function GuardPanel({ variant, guards, payload, result, token, run, L }: PanelProps) {
  const bad = result ? result.outcome !== "neutralized" : false;
  return (
    <div className="flex h-full flex-col rounded-lg border border-[#21262D] bg-[#161B22]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
        <span className="font-medium text-[#E6EDF3]">{L.guardTitle}</span>
        <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[#F85149]">
          {payload.id.toUpperCase()}
        </span>
        <span>{L.guardHint}</span>
      </div>

      <div key={token} className="flex flex-1 flex-col justify-center gap-2 p-4">
        {guards.map((g, i) => {
          const has = variant.guards.includes(g.id);
          const stops = result?.stoppedBy === g.id;
          const missing = bad && !has && payload.guard === g.id;
          let border = "#21262D";
          let bg = "#0D1117";
          if (stops) {
            border = "#3FB95099";
            bg = "#3FB95018";
          } else if (missing) {
            border = "#F8514999";
            bg = "#F8514912";
          }
          return (
            <div
              key={g.id}
              className="flex items-start gap-3 rounded-md border px-3 py-2.5 transition-all duration-500 motion-reduce:transition-none"
              style={{
                borderColor: run ? border : "#21262D",
                backgroundColor: run ? bg : "#0D1117",
                opacity: run ? 1 : 0,
                transform: run ? "none" : "translateY(6px)",
                transitionDelay: run ? `${i * 120}ms` : "0ms",
              }}
            >
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#0D1117]"
                style={{ backgroundColor: has ? GREEN : "#484F58" }}
                aria-hidden="true"
              >
                {has ? "✓" : "–"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm" style={{ color: has ? "#E6EDF3" : "#8B949E" }}>
                  {g.label}
                </p>
                {stops && <p className="mt-0.5 text-xs text-[#3FB950]">{L.stopsThis}</p>}
                {missing && <p className="mt-0.5 text-xs text-[#FF7B72]">{L.shouldStop}</p>}
              </div>
              <span className="shrink-0 text-xs" style={{ color: has ? GREEN : "#8B949E" }}>
                {has ? L.present : L.absent}
              </span>
            </div>
          );
        })}
        <p className="pt-1 text-[11px] leading-relaxed text-[#8B949E]">{L.disclaimer}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel 2: one animation per scenario                                 */
/* ------------------------------------------------------------------ */

const CAPTION = "text-sm leading-relaxed";
const SMALL = "text-xs text-[#8B949E]";

/* ---- zones: data crosses a wall, the gate either holds or does not ---- */

function ZonesViz({ payload, result, guards, token, run }: PanelProps) {
  const z = payload.zone;
  const n = useTicker(token, run, 900, 3);
  if (!z || !result) {
    return <p className="text-sm text-[#8B949E]">Skenario ini tidak punya animasi zona.</p>;
  }
  const bad = result.outcome !== "neutralized";
  const stopper = guards.find((g) => g.id === result.stoppedBy);
  const ideal = guards.find((g) => g.id === payload.guard);
  const crossed = !result.stoppedBy;
  const gateText = stopper
    ? stopper.label
    : ideal
      ? `${ideal.label} (tidak ada)`
      : "Tidak ada penjaga khusus, kiriman ini memang sah";
  // The chip stays inside the left half until it reaches the gate, then either
  // lands in the right half or goes back. It never leaves its own half, so it
  // cannot cover the text of the other zone.
  const x = n === 0 ? 23 : n === 1 ? 29 : crossed ? 77 : 23;
  const gateOn = n >= 1;
  const done = n >= 3;
  const tone = bad ? "#FF7B72" : GREEN;

  let right = z.before ?? "tidak ada perubahan";
  let rightColor = "#8B949E";
  if (done && crossed) {
    right = z.landed;
    rightColor = tone;
  } else if (done) {
    right = `${z.before ?? "tidak ada perubahan"} (tetap utuh)`;
    rightColor = GREEN;
  }

  return (
    <div className="space-y-3">
      <div className="relative h-60" aria-hidden="true">
        <div className="absolute bottom-0 left-0 top-0 w-[44%] rounded-md border border-dashed border-[#F85149]/40 bg-[#F85149]/5 p-2">
          <span className="text-[10px] uppercase tracking-wide text-[#F85149]">
            {z.fromLabel ?? "Zona tidak tepercaya"}
          </span>
        </div>
        <div className="absolute bottom-0 right-0 top-0 flex w-[44%] flex-col rounded-md border border-[#3FB950]/40 bg-[#3FB950]/5 p-2">
          <span className="text-[10px] uppercase tracking-wide text-[#3FB950]">
            {z.toLabel ?? "Zona tepercaya"}
          </span>
          <div className="mt-auto">
            <p className="break-words text-[11px] text-[#8B949E]">{z.field}</p>
            <p
              className="break-words font-mono text-xs transition-colors duration-500 motion-reduce:transition-none"
              style={{ color: rightColor }}
            >
              {right}
            </p>
          </div>
        </div>

        {/* the wall and its gate */}
        <div className="absolute bottom-0 left-1/2 top-0 w-1.5 -translate-x-1/2 rounded bg-[#30363D]" />
        <div
          className="absolute left-1/2 top-[30%] h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border transition-all duration-500 motion-reduce:transition-none"
          style={{
            backgroundColor: gateOn && stopper ? GREEN : "#0D1117",
            borderColor: gateOn ? (stopper ? GREEN : RED) : "#30363D",
            borderStyle: gateOn && !stopper ? "dashed" : "solid",
          }}
        />

        {/* the data travelling */}
        <div
          className="absolute top-[30%] max-w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1.5 transition-[left] duration-700 ease-in-out motion-reduce:transition-none"
          style={{
            left: `${x}%`,
            borderColor: bad ? "#F8514988" : "#3FB95088",
            backgroundColor: "#161B22",
          }}
        >
          <p className="break-words text-[10px] leading-tight text-[#8B949E]">{z.chip.label}</p>
          <p className="break-words font-mono text-xs" style={{ color: bad ? "#FF7B72" : GREEN }}>
            {z.chip.value}
          </p>
        </div>
      </div>

      <p
        className="text-xs transition-colors duration-500 motion-reduce:transition-none"
        style={{ color: gateOn ? (stopper ? GREEN : "#FF7B72") : "#8B949E" }}
      >
        Gerbang: {gateText}
      </p>
      <p
        className={`${CAPTION} transition-opacity duration-500 motion-reduce:transition-none`}
        style={{ opacity: done ? 1 : 0, color: tone }}
      >
        {stopper
          ? "Gerbang menahannya, jadi isi zona tepercaya tidak berubah."
          : bad
            ? "Kiriman dari luar menembus gerbang dan mengubah isi zona tepercaya."
            : "Kiriman sah diterima dan diproses sebagaimana mestinya."}
      </p>
    </div>
  );
}

/* ---- dump: what an attacker reads out of a leaked table ---- */

function DumpViz({ result, token, run }: PanelProps) {
  const dump = result?.dump;
  const rowCount = dump ? dump.rows.length : 0;
  const n = useTicker(token, run, 600, rowCount + 2);
  if (!dump) return <p className="text-sm text-[#8B949E]">Skenario ini tidak punya tabel untuk dibaca.</p>;

  const counts = new Map<string, number>();
  for (const r of dump.rows) counts.set(r.stored, (counts.get(r.stored) ?? 0) + 1);
  const revealed = n > rowCount;
  const readable = dump.mode !== "opaque";
  const color = readable ? "#FF7B72" : GREEN;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5 font-mono text-xs">
        <span className={`${SMALL} font-sans`}>Pengguna</span>
        <span className={`${SMALL} font-sans`}>Tersimpan di database</span>
        <span className={`${SMALL} font-sans`}>
          {dump.mode === "decode" ? "Setelah di-decode" : "Yang dibaca penyerang"}
        </span>
        {dump.rows.map((r, i) => {
          const shown = i < n;
          const dup = (counts.get(r.stored) ?? 0) > 1 && dump.mode === "match";
          return (
            <div key={i} className="contents">
              <span
                className="py-1 text-[#C9D1D9] transition-opacity duration-500 motion-reduce:transition-none"
                style={{ opacity: shown ? 1 : 0 }}
              >
                {r.user}
              </span>
              <span
                className="min-w-0 break-all rounded border px-2 py-1 transition-all duration-500 motion-reduce:transition-none"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? "none" : "translateY(6px)",
                  borderColor: dup ? "#F8514988" : "#30363D",
                  backgroundColor: dup ? "#F8514912" : "#0D1117",
                  color: "#C9D1D9",
                }}
              >
                {r.stored}
              </span>
              <span
                className="min-w-0 break-all rounded border px-2 py-1 transition-all duration-500 motion-reduce:transition-none"
                style={{
                  opacity: revealed ? 1 : 0,
                  transitionDelay: revealed ? `${i * 150}ms` : "0ms",
                  borderColor: readable ? "#F8514966" : "#3FB95066",
                  backgroundColor: readable ? "#F8514918" : "#3FB95018",
                  color,
                }}
              >
                {r.read}
              </span>
            </div>
          );
        })}
      </div>
      <p
        className={`${CAPTION} transition-opacity duration-500 motion-reduce:transition-none`}
        style={{ opacity: revealed ? 1 : 0, color }}
      >
        {dump.note}
      </p>
    </div>
  );
}

/* ---- filename: what the check reads, where the file lands, what runs ---- */

const SEG_STYLE: Record<FileSeg["k"], string> = {
  base: "#C9D1D9",
  decoy: "#F0883E",
  real: "#FF7B72",
  junk: "#8B949E",
};
const TONE_COLOR: Record<Step["tone"], string> = {
  bad: RED,
  ok: GREEN,
  stop: GREEN,
  skip: "#484F58",
};

function StepList({ steps, n }: { steps: Step[]; n: number }) {
  return (
    <div className="border-l-2 border-[#21262D] pl-4">
      {steps.map((s, i) => {
        const shown = i < n;
        const c = TONE_COLOR[s.tone];
        return (
          <div
            key={i}
            className="relative pb-3 transition-all duration-500 last:pb-0 motion-reduce:transition-none"
            style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(6px)" }}
          >
            <span
              className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#161B22]"
              style={{ backgroundColor: c }}
              aria-hidden="true"
            />
            <p className="text-xs font-medium" style={{ color: s.tone === "skip" ? "#8B949E" : "#E6EDF3" }}>
              {s.title}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: s.tone === "skip" ? "#8B949E" : "#C9D1D9" }}>
              {s.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function FilenameViz({ payload, result, token, run }: PanelProps) {
  const steps = result?.steps ?? [];
  const n = useTicker(token, run, 800, steps.length + 1);
  const file = payload.file;
  if (!file || !result) {
    return <p className="text-sm text-[#8B949E]">Skenario ini tidak punya nama file untuk dibedah.</p>;
  }
  const last = steps[steps.length - 1];
  const lastColor = result.outcome === "neutralized" ? GREEN : "#FF7B72";

  return (
    <div className="space-y-3">
      <div>
        <p className={`mb-1.5 ${SMALL}`}>Nama file dari penyerang</p>
        <div className="break-all rounded border border-[#30363D] bg-[#0D1117] px-3 py-2 font-mono text-sm">
          {file.segs.map((s, i) => (
            <span
              key={i}
              className="transition-colors duration-500 motion-reduce:transition-none"
              style={{
                color: run ? SEG_STYLE[s.k] : "#C9D1D9",
                textDecoration: s.k === "decoy" ? "underline" : "none",
                opacity: s.k === "junk" ? 0.8 : 1,
              }}
            >
              {s.t}
            </span>
          ))}
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#8B949E]">
          <span style={{ color: SEG_STYLE.decoy }}>oranye: yang dilihat pengecekan</span>
          <span style={{ color: SEG_STYLE.real }}>merah: yang akhirnya dipakai server</span>
        </p>
      </div>

      <StepList steps={steps} n={n} />

      {last && (
        <p
          className={`${CAPTION} transition-opacity duration-500 motion-reduce:transition-none`}
          style={{ opacity: n > steps.length ? 1 : 0, color: lastColor }}
        >
          {result.outcome === "neutralized"
            ? "Tidak ada kode penyerang yang berjalan di server."
            : "Berkas penyerang berjalan sebagai program di server."}
        </p>
      )}
    </div>
  );
}

/* ---- steps: the order of operations is the lesson ---- */

function StepsViz({ payload, result, token, run }: PanelProps) {
  const steps = result?.steps ?? [];
  const n = useTicker(token, run, 800, steps.length + 1);
  if (!result || steps.length === 0) {
    return <p className="text-sm text-[#8B949E]">Skenario ini tidak punya langkah untuk diperlihatkan.</p>;
  }
  const blob = payload.blob;
  const bad = result.outcome !== "neutralized";
  const caption = bad
    ? (blob?.bad ?? "Data dari luar diproses sebelum keasliannya terbukti.")
    : (blob?.good ?? "Data ditolak atau diperiksa sebelum diproses.");

  return (
    <div className="space-y-3">
      {blob && (
        <div>
          <p className={`mb-1.5 ${SMALL}`}>{blob.label}</p>
          <div className="break-all rounded border border-[#30363D] bg-[#0D1117] px-3 py-2 font-mono text-sm text-[#C9D1D9]">
            {blob.text}
          </div>
        </div>
      )}
      <StepList steps={steps} n={n} />
      <p
        className={`${CAPTION} transition-opacity duration-500 motion-reduce:transition-none`}
        style={{ opacity: n > steps.length ? 1 : 0, color: bad ? "#FF7B72" : GREEN }}
      >
        {caption}
      </p>
    </div>
  );
}

/* ---- route: a hostile script or mapping redirects data to the wrong place ---- */

function RouteViz({ payload, result, guards, token, run }: PanelProps) {
  const r = payload.route;
  const n = useTicker(token, run, 900, 3);
  if (!r || !result) {
    return <p className="text-sm text-[#8B949E]">Skenario ini tidak punya rute untuk digambarkan.</p>;
  }
  const bad = result.outcome !== "neutralized";
  const stopper = guards.find((g) => g.id === result.stoppedBy);
  const ideal = guards.find((g) => g.id === payload.guard);
  const done = n >= 3;
  const tone = bad ? "#FF7B72" : GREEN;

  let viaNote = "";
  let viaColor = "#8B949E";
  if (n >= 2 && stopper) {
    viaNote = `${stopper.label}: perubahan ditolak`;
    viaColor = GREEN;
  } else if (n >= 2 && bad) {
    viaNote = r.change;
    viaColor = "#FF7B72";
  } else if (n >= 2) {
    viaNote = "tidak ada yang berubah";
    viaColor = GREEN;
  }

  // Everything is laid out in normal flow, so long text only makes boxes taller
  // and can never cover another box. The "movement" is arrows lighting up.
  const arrow = (on: boolean, color: string) => (
    <span
      className="text-lg leading-none transition-colors duration-500 motion-reduce:transition-none"
      style={{ color: on ? color : "#30363D" }}
    >
      →
    </span>
  );

  return (
    <div className="space-y-3">
      <div
        className="rounded-md border bg-[#0D1117] px-3 py-2 transition-colors duration-500 motion-reduce:transition-none"
        style={{ borderColor: n >= 2 && bad ? "#F8514988" : "#30363D" }}
      >
        <p className="text-[10px] uppercase tracking-wide text-[#8B949E]">Data yang dikirim</p>
        <p
          className="break-words font-mono text-sm transition-colors duration-500 motion-reduce:transition-none"
          style={{ color: n >= 2 ? (bad ? "#FF7B72" : GREEN) : "#C9D1D9" }}
        >
          {r.data}
        </p>
      </div>

      <div
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.3fr)_auto_minmax(0,1.1fr)] items-stretch gap-x-2"
        aria-hidden="true"
      >
        <div className="self-center rounded-md border border-[#30363D] bg-[#0D1117] p-2 text-xs text-[#C9D1D9]">
          {r.from}
        </div>
        <div className="flex items-center">{arrow(n >= 1, "#C9D1D9")}</div>
        <div
          className="self-center rounded-md border bg-[#0D1117] p-2 text-xs text-[#C9D1D9] transition-colors duration-500 motion-reduce:transition-none"
          style={{ borderColor: n >= 2 ? (stopper ? GREEN : bad ? RED : GREEN) : "#30363D" }}
        >
          <p className="text-[10px] uppercase tracking-wide text-[#8B949E]">Dimuat dari luar</p>
          <p className="break-words">{r.via}</p>
          <p
            className="mt-1 break-words text-[11px] transition-opacity duration-500 motion-reduce:transition-none"
            style={{ opacity: n >= 2 ? 1 : 0, color: viaColor }}
          >
            {viaNote || " "}
          </p>
        </div>
        <div className="flex flex-col justify-around">
          {arrow(n >= 2 && !bad, GREEN)}
          {arrow(n >= 2 && bad, RED)}
        </div>
        <div className="flex flex-col gap-2">
          <div
            className="rounded-md border border-dashed p-2 text-xs text-[#C9D1D9] transition-colors duration-500 motion-reduce:transition-none"
            style={{
              borderColor: done && !bad ? GREEN : "#3FB95066",
              backgroundColor: done && !bad ? "#3FB95018" : "#3FB9500D",
            }}
          >
            <p className="text-[10px] uppercase tracking-wide text-[#3FB950]">Tujuan seharusnya</p>
            <p className="break-words">{r.app}</p>
          </div>
          <div
            className="rounded-md border border-dashed p-2 text-xs text-[#C9D1D9] transition-colors duration-500 motion-reduce:transition-none"
            style={{
              borderColor: done && bad ? RED : "#F8514966",
              backgroundColor: done && bad ? "#F8514918" : "#F851490D",
            }}
          >
            <p className="text-[10px] uppercase tracking-wide text-[#F85149]">Tujuan penyerang</p>
            <p className="break-words">{r.evil}</p>
          </div>
        </div>
      </div>

      {!stopper && ideal && bad && (
        <p className="text-xs text-[#FF7B72]">Penjaga yang seharusnya ada: {ideal.label}</p>
      )}
      <p
        className={`${CAPTION} transition-opacity duration-500 motion-reduce:transition-none`}
        style={{ opacity: done ? 1 : 0, color: tone }}
      >
        {stopper
          ? "Bagian dari luar tidak lolos pemeriksaan, jadi data tetap sampai ke tujuan yang benar."
          : bad
            ? "Bagian dari luar mengubah tujuan data, dan data sampai ke penyerang."
            : "Tidak ada yang berubah, data sampai ke tujuan yang benar."}
      </p>
    </div>
  );
}

function VizPanel(props: PanelProps & { onReplay: () => void }) {
  const { payload, result, L, onReplay } = props;
  const kind: VizKind =
    payload.viz ??
    (payload.file
      ? "filename"
      : payload.route
        ? "route"
        : payload.zone
          ? "zones"
          : payload.blob
            ? "steps"
            : "dump");

  let body;
  if (!result) {
    body = (
      <p className="text-sm text-[#8B949E]">
        Hasil untuk skenario ini belum tersedia di implementasi ini.
      </p>
    );
  } else if (kind === "filename") body = <FilenameViz {...props} />;
  else if (kind === "route") body = <RouteViz {...props} />;
  else if (kind === "steps") body = <StepsViz {...props} />;
  else if (kind === "dump") body = <DumpViz {...props} />;
  else body = <ZonesViz {...props} />;

  return (
    <div className="flex h-full flex-col rounded-lg border border-[#21262D] bg-[#161B22]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
        <span className="font-medium text-[#E6EDF3]">{L.vizTitle}</span>
        <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[#F85149]">
          {payload.id.toUpperCase()}
        </span>
        <span className="flex-1">{L.vizHint}</span>
        <button
          type="button"
          onClick={onReplay}
          className="rounded border border-[#21262D] px-3 py-2 text-xs text-[#8B949E] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
        >
          Putar ulang
        </button>
      </div>
      {/* keyed by token so a new selection remounts at its start state */}
      <div key={props.token} className="flex flex-1 flex-col p-4">
        {body}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main renderer                                                       */
/* ------------------------------------------------------------------ */

const STEP_MS = 9000; // autoplay: how long the tour stays on each step

export default function BoundarySimulation({ config }: { config: BoundaryConfig }) {
  const { payloads, variants, guards } = config;
  const L: Required<Labels> = { ...DEFAULT_LABELS, ...(config.labels ?? {}) };

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
    setPinned(pinnedId); // keep whatever scenario is currently in focus
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
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const tag = TAG[variant.tag] ?? TAG.weak;

  // Which scenario the side panels show: the one picked (or the tour's), else
  // the first one that went badly, which is the interesting one.
  const autoFocusId =
    payloads.find((p) => {
      const r = variant.results[p.id];
      return r && r.outcome !== "neutralized";
    })?.id ?? payloads[0].id;
  const focusId = pinnedId && payloads.some((p) => p.id === pinnedId) ? pinnedId : autoFocusId;
  const focusPayload = payloads.find((p) => p.id === focusId) ?? payloads[0];
  const focusResult = variant.results[focusPayload.id];

  // Both panels replay when the implementation or the scenario changes.
  const asmToken = `${variant.id}:${focusId}:${runKey}`;
  const assembled = useArrived(asmToken, seen);

  // Score for the verdict banner, derived from the results (no extra data).
  const known = payloads.filter((p) => variant.results[p.id]);
  const through = known.filter((p) => variant.results[p.id]?.outcome !== "neutralized").length;
  const scoreColor = through === 0 ? GREEN : through === known.length ? RED : "#D29922";
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

  const panelProps: PanelProps = {
    variant,
    guards,
    payload: focusPayload,
    result: focusResult,
    token: asmToken,
    run: assembled,
    L,
  };

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

      {/* Code + guards (left)  |  how the attack works (right) */}
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

          <div className="min-h-0 flex-1">
            <GuardPanel {...panelProps} />
          </div>
        </div>

        <div ref={animRef} className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <VizPanel {...panelProps} onReplay={() => setRunKey((k) => k + 1)} />
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

        {/* Scenarios: tap to focus + see the background of each one */}
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
                    <span className="min-w-0 flex-1 break-words text-sm text-[#F0883E]">{p.raw}</span>
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