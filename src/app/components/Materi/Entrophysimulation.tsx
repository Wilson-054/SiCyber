"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Types (mirror the JSON in simulations.config, template = "entropy") */
/* ------------------------------------------------------------------ */

type Outcome = "exploited" | "bypassed" | "neutralized";
type Tag = "vulnerable" | "weak" | "secure";

type Stage = { id: string; label: string; icon?: string };
// Which animation explains a scenario.
type VizKind = "window" | "predict" | "blind" | "lfsr" | "cycle" | "rows" | "race" | "blocks";
// A scenario (kept under the key `payloads` so seeds look like the old format).
type Payload = { id: string; raw: string; explains: string; viz?: VizKind };
// How a variant generates its values (used by the register animations).
type Gen =
  | { kind: "lfsr"; bits: number; taps: number[]; seed: string }
  | { kind: "hash"; bits?: number };
// What the attacker can see, and what they manage to conclude from it.
type Tape = { seen: string[]; got: string };
type Result = {
  outcome: Outcome;
  stoppedAt: string | null;
  reason: string;
  label?: string;
  // Search space in bits. `claimed` = what looks big on paper,
  // `remaining` = what the attacker really has to search.
  claimed?: number;
  remaining?: number;
  // Guesses per second for this result (defaults to config.rate).
  rate?: number;
  // Shown instead of the bars when the attack is not measured in guesses.
  metric?: string;
  tape?: Tape;
  // Extra data for a specific animation: which hash lane, which cipher mode.
  viz?: { lane?: string; mode?: string };
};
type Variant = {
  id: string;
  tag: Tag;
  label: string;
  code: string;
  explanation: string;
  gen?: Gen;
  results: Record<string, Result | undefined>;
};
type TourStep = { variant: string; focus?: string; stage?: string; caption: string };
type Rule = { title: string; text: string; proof: string };

const DEFAULT_LABELS = {
  list: "Skenario",
  listHint: "(ketuk untuk detail)",
  detail: "Latar skenario",
  allSafe: "Semua {total} skenario berakhir aman",
  someBad: "{n} dari {total} skenario berujung bahaya",
  legendBad: "berujung bahaya",
  legendGood: "aman / tidak berdampak",
  spaceTitle: "Ruang tebakan",
  spaceHint: "ketuk skenario lain untuk mengganti",
  claimedLabel: "Tampak di atas kertas",
  remainingLabel: "Yang harus dicoba penyerang",
  noGuessNeeded: "Tidak perlu menebak. Nilainya langsung dihitung atau dicocokkan.",
  noSpace: "Skenario ini tidak diukur lewat ruang tebakan.",
  vizTitle: "Cara kerja serangan",
  vizHint: "ketuk skenario lain untuk mengganti",
  seenLabel: "Yang didapat penyerang",
  gotLabel: "Yang berhasil dilakukan penyerang",
  noTape: "Skenario ini tidak meninggalkan jejak yang bisa diamati.",
  assumption:
    "Angka dan nilai pada visualisasi ini ilustrasi untuk belajar, bukan hasil serangan nyata. Kecepatan tebakan diasumsikan {rate} per detik.",
};
type Labels = Partial<typeof DEFAULT_LABELS>;

export type EntropyConfig = {
  stages?: Stage[]; // kept for compatibility with the pipeline seed format
  payloads: Payload[];
  variants: Variant[];
  tour?: TourStep[];
  rules?: Rule[];
  labels?: Labels;
  maxBits?: number; // width of the bar track, in bits (default 128)
  rate?: number; // guesses per second (default 1e9)
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
const ORANGE = "#F0883E";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function isEntropyConfig(c: unknown): c is EntropyConfig {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  return (
    Array.isArray(o.payloads) &&
    o.payloads.length > 0 &&
    Array.isArray(o.variants) &&
    o.variants.length > 0
  );
}

// Thousands separator with dots (Indonesian), no Intl so server and client agree.
function dots(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtRate(r: number): string {
  if (r >= 1e12) return `${dots(r / 1e12)} triliun`;
  if (r >= 1e9) return `${dots(r / 1e9)} miliar`;
  if (r >= 1e6) return `${dots(r / 1e6)} juta`;
  return dots(r);
}

function fmtSpace(bits: number): string {
  if (bits <= 40) return `${dots(Math.pow(2, bits))} kemungkinan (2^${bits})`;
  return `2^${bits} kemungkinan`;
}

function fmtTime(s: number): string {
  if (s < 0.001) return "kurang dari 1 milidetik";
  if (s < 1) return `${Math.round(s * 1000)} milidetik`;
  if (s < 60) return `${s < 10 ? s.toFixed(1).replace(".", ",") : Math.round(s)} detik`;
  if (s < 3600) return `${Math.round(s / 60)} menit`;
  if (s < 86400) return `${Math.round(s / 3600)} jam`;
  if (s < 86400 * 365) return `${Math.round(s / 86400)} hari`;
  const y = s / (86400 * 365);
  if (y < 1e6) return `${dots(y)} tahun`;
  if (y < 1.38e10) return `${dots(y / 1e6)} juta tahun`;
  return "jauh melampaui umur alam semesta";
}

// Small deterministic generators, so the same scenario always plays the same way.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hexOf(r: () => number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(r() * 16).toString(16);
  return s;
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
/* Panel 1: search space. The bar collapsing IS the lesson             */
/* ------------------------------------------------------------------ */

function BarRow({
  label,
  valueText,
  widthPct,
  color,
}: {
  label: string;
  valueText: string;
  widthPct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-[#8B949E]">{label}</span>
        <span className="font-mono text-[#E6EDF3]">{valueText}</span>
      </div>
      <div className="h-3 overflow-hidden rounded bg-[#0D1117]">
        <div
          className="h-full rounded transition-[width,background-color] duration-1000 ease-in-out motion-reduce:transition-none"
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function SpacePanel({
  result,
  payload,
  maxBits,
  defaultRate,
  assembled,
  token,
  L,
}: {
  result: Result | undefined;
  payload: Payload;
  maxBits: number;
  defaultRate: number;
  assembled: boolean;
  token: string;
  L: Required<Labels>;
}) {
  const rem = result?.remaining;
  const claimed = result?.claimed;
  const rate = result?.rate ?? defaultRate;
  const bad = result ? result.outcome !== "neutralized" : false;
  const color = bad ? RED : GREEN;
  const pct = (b: number) => Math.min(100, Math.max(1.5, (b / maxBits) * 100));

  let summary = "";
  if (rem !== undefined) {
    summary =
      rem <= 0
        ? L.noGuessNeeded
        : `${fmtSpace(rem)}. Waktu yang dibutuhkan: ${fmtTime(Math.pow(2, rem) / rate)} pada ${fmtRate(rate)} tebakan per detik.`;
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-[#21262D] bg-[#161B22]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
        <span className="font-medium text-[#E6EDF3]">{L.spaceTitle}</span>
        <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[#F85149]">
          {payload.id.toUpperCase()}
        </span>
        <span>{L.spaceHint}</span>
      </div>

      {/* keyed by token so a new selection remounts at its start state */}
      <div key={token} className="flex flex-1 flex-col justify-center gap-4 p-4">
        {!result ? (
          <p className="text-sm text-[#8B949E]">
            Hasil untuk skenario ini belum tersedia di implementasi ini.
          </p>
        ) : rem === undefined ? (
          <p className="text-sm leading-relaxed text-[#C9D1D9]">{result.metric ?? L.noSpace}</p>
        ) : (
          <>
            <div className="space-y-3">
              {claimed !== undefined && (
                <BarRow
                  label={L.claimedLabel}
                  valueText={`${claimed} bit`}
                  widthPct={pct(claimed)}
                  color="#8B949E"
                />
              )}
              <BarRow
                label={L.remainingLabel}
                valueText={`${rem} bit`}
                widthPct={assembled ? pct(rem) : pct(claimed ?? rem)}
                color={assembled ? color : "#8B949E"}
              />
              <div className="flex justify-between text-[10px] text-[#8B949E]" aria-hidden="true">
                <span>0 bit</span>
                <span>{maxBits} bit</span>
              </div>
            </div>
            <p
              className="border-t border-[#21262D] pt-3 text-sm leading-relaxed text-[#C9D1D9] transition-opacity duration-500 motion-reduce:transition-none"
              style={{ opacity: assembled ? 1 : 0, transitionDelay: assembled ? "900ms" : "0ms" }}
            >
              {summary}
            </p>
          </>
        )}
        <p className="text-[11px] leading-relaxed text-[#8B949E]">
          {L.assumption.replace("{rate}", fmtRate(defaultRate))}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel 2: one animation per scenario                                 */
/* ------------------------------------------------------------------ */

type VizProps = {
  variant: Variant;
  payload: Payload;
  result: Result | undefined;
  token: string;
  run: boolean;
  L: Required<Labels>;
};

const CAPTION = "text-sm leading-relaxed";
const SMALL = "text-xs text-[#8B949E]";

/* ---- window: the whole space dims, only the real search window stays ---- */

const GRID = 120;

function SeedWindow({ variant, payload, result, token, run }: VizProps) {
  const rem = result?.remaining ?? 0;
  const claimed = result?.claimed;
  const bad = result ? result.outcome !== "neutralized" : false;
  const shrunk = claimed !== undefined && rem < claimed;
  const k =
    rem <= 0
      ? 1
      : shrunk
        ? Math.max(2, Math.min(GRID, Math.round((GRID * rem) / (claimed as number))))
        : GRID;
  const target = bad ? (k === 1 ? 0 : hashStr(variant.id + payload.id) % k) : -1;
  const limit = bad ? target : Math.min(k - 1, 30);

  const n = useTicker(token, run, 60, GRID + 25);
  const cursor = Math.min(n - 20, limit);
  const found = bad && n - 20 >= target && n >= 20;
  const scanning = n >= 20 && !found;
  const stalled = !bad && n - 20 >= limit && n >= 20;

  let status = "";
  if (!run || n < 20) status = "Seluruh kemungkinan terlihat luas. Mana yang benar-benar harus dicoba?";
  else if (found && rem <= 0) status = "Tidak ada yang perlu dicoba. Nilainya langsung dihitung atau dicocokkan.";
  else if (found) status = "Hanya jendela kecil ini yang perlu dicoba, lalu nilainya ketemu.";
  else if (stalled) status = "Ruang tebakan tetap terlalu luas. Tebakan tidak pernah sampai ke nilai yang benar.";
  else status = "Penyerang mencoba satu per satu.";

  return (
    <div className="space-y-3">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}
        aria-hidden="true"
      >
        {Array.from({ length: GRID }, (_, i) => {
          const inWin = i < k;
          const isHit = found && i === target;
          const isCursor = scanning && i === cursor;
          const swept = n >= 20 && i < cursor && inWin;
          let bg = "#21262D";
          if (run && inWin) bg = "#F0883E40";
          if (swept) bg = "#8B949E80";
          if (isCursor) bg = ORANGE;
          if (isHit) bg = RED;
          return (
            <span
              key={i}
              className="aspect-square rounded-sm transition-[background-color,opacity,transform] duration-500 motion-reduce:transition-none"
              style={{
                backgroundColor: bg,
                opacity: run && !inWin ? 0.12 : 1,
                transform: run && !inWin ? "scale(0.6)" : isHit ? "scale(1.25)" : "scale(1)",
                transitionDelay: run && !inWin ? `${i * 6}ms` : "0ms",
              }}
            />
          );
        })}
      </div>
      <p className={`${CAPTION} text-[#C9D1D9]`}>{status}</p>
    </div>
  );
}

/* ---- predict / blind: the system's tokens next to the attacker's guesses ---- */

const TOKEN_ROWS = 7;

function TokenStream({
  variant,
  payload,
  result,
  token,
  run,
  mode,
}: VizProps & { mode: "predict" | "blind" }) {
  const bad = result ? result.outcome !== "neutralized" : false;
  const observe = mode === "blind" ? 0 : 3;
  const rows = useMemo(() => {
    const r = rng(hashStr(variant.id + payload.id));
    return Array.from({ length: TOKEN_ROWS }, () => ({ victim: hexOf(r, 12), other: hexOf(r, 12) }));
  }, [variant.id, payload.id]);
  const n = useTicker(token, run, 600, TOKEN_ROWS);

  let status = "Penyerang mencatat token yang keluar.";
  if (n > observe) {
    status =
      mode === "predict" && bad
        ? "Tebakan cocok terus. Ini bukan kebetulan, penyerang sudah tahu cara token berikutnya dibuat."
        : "Tebakan tidak pernah cocok.";
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-x-3 gap-y-1.5 font-mono text-xs">
        <span className={`${SMALL} font-sans`}>Token yang dibuat sistem</span>
        <span className={`${SMALL} font-sans`}>Tebakan penyerang</span>
        <span />
        {rows.map((row, i) => {
          const shown = i < n;
          const observing = i < observe;
          const hit = mode === "predict" && bad && !observing;
          const guess = observing ? "mengamati..." : hit ? row.victim : row.other;
          return (
            <div key={i} className="contents">
              <span
                className="rounded border border-[#30363D] bg-[#0D1117] px-2 py-1 text-[#C9D1D9] transition-all duration-500 motion-reduce:transition-none"
                style={{ opacity: shown ? 1 : 0, transform: shown ? "none" : "translateY(6px)" }}
              >
                {row.victim}
              </span>
              <span
                className="rounded border px-2 py-1 transition-all duration-500 motion-reduce:transition-none"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? "none" : "translateY(6px)",
                  borderColor: observing ? "#30363D" : hit ? "#F8514966" : "#3FB95066",
                  backgroundColor: observing ? "#0D1117" : hit ? "#F8514918" : "#3FB95018",
                  color: observing ? "#8B949E" : hit ? "#FF7B72" : GREEN,
                }}
              >
                {guess}
              </span>
              <span
                className="flex items-center font-sans text-[11px] transition-opacity duration-500 motion-reduce:transition-none"
                style={{ opacity: shown && !observing ? 1 : 0, color: hit ? RED : GREEN }}
              >
                {hit ? "cocok" : "meleset"}
              </span>
            </div>
          );
        })}
      </div>
      <p className={`${CAPTION} text-[#C9D1D9]`}>{status}</p>
    </div>
  );
}

/* ---- lfsr: a real shift register, and an attacker cloning it ---- */

function hexToBits(hex: string, bits: number): number[] {
  const h = hex.replace(/^0x/i, "");
  const out: number[] = [];
  for (let i = 0; i < bits; i++) {
    const d = h[h.length - 1 - Math.floor(i / 4)];
    const v = d ? parseInt(d, 16) : 0;
    out.push((v >> (i % 4)) & 1);
  }
  return out;
}

// Fibonacci LFSR, bit 0 = least significant. Same update as the code shown.
function lfsrNext(state: number[], taps: number[]): { state: number[]; out: number } {
  let b = 0;
  for (const t of taps) b ^= state[t] ?? 0;
  return { state: [...state.slice(1), b], out: b };
}

type LfsrSim = {
  bits: number;
  taps: number[];
  hidden: boolean;
  real: number[][];
  outs: number[];
  clones: number[][];
  preds: number[];
  total: number;
};

// Replays the generator, and an attacker who copies its last `bits` outputs
// into a clone register. On a real LFSR the clone is exact. On a hash-based
// generator the same trick fails, because the model is wrong.
function buildLfsrSim(gen: Gen | undefined, seedKey: string): LfsrSim {
  const model = gen && gen.kind === "lfsr" ? gen : null;
  const bits = model ? model.bits : 16;
  const taps = model ? model.taps : [0, 2, 3, 5];
  const total = bits + 20;
  const r = rng(hashStr(seedKey));
  let real: number[] = model ? hexToBits(model.seed, bits) : [];
  const realStates: number[][] = [real];
  const outs: number[] = [0];
  const clones: number[][] = [[]];
  const preds: number[] = [0];
  let clone: number[] = [];
  for (let t = 1; t <= total; t++) {
    let out: number;
    if (model) {
      const s = lfsrNext(real, taps);
      real = s.state;
      out = s.out;
      realStates.push(real);
    } else {
      out = r() < 0.5 ? 0 : 1;
    }
    preds[t] = -1;
    if (t > bits) {
      const c = lfsrNext(clone, taps);
      clone = c.state;
      preds[t] = c.out;
      if (!model && t % 3 === 0) out = 1 - c.out;
    }
    outs[t] = out;
    if (t === bits) clone = outs.slice(1, bits + 1);
    clones[t] = clone;
  }
  return { bits, taps, hidden: !model, real: realStates, outs, clones, preds, total };
}

function Cells({
  values,
  taps,
  cols,
}: {
  values: (number | null)[];
  taps?: number[];
  cols: number;
}) {
  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {values.map((v, i) => (
        <span
          key={i}
          className="aspect-square rounded-[3px] transition-colors duration-150 motion-reduce:transition-none"
          style={{
            backgroundColor: v === null ? "#21262D" : v === 1 ? ORANGE : "#0D1117",
            border: v === 0 ? "1px solid #30363D" : "1px solid transparent",
            boxShadow: taps && taps.includes(i) ? "0 0 0 1.5px #58A6FF" : "none",
          }}
        />
      ))}
    </div>
  );
}

function LfsrView({ variant, payload, token, run }: VizProps) {
  const sim = useMemo(
    () => buildLfsrSim(variant.gen, variant.id + payload.id),
    [variant.gen, variant.id, payload.id],
  );
  const n = useTicker(token, run, sim.bits > 32 ? 70 : 150, sim.total);
  const cols = sim.bits > 32 ? 32 : sim.bits;

  const realCells: (number | null)[] = sim.hidden ? [] : (sim.real[n] ?? sim.real[0]);
  let cloneCells: (number | null)[];
  if (n >= sim.bits) cloneCells = sim.clones[n] ?? Array(sim.bits).fill(null);
  else cloneCells = Array.from({ length: sim.bits }, (_, i) => (i < n ? sim.outs[i + 1] : null));

  const stream = sim.outs.slice(1, n + 1).slice(-32);
  const marks: boolean[] = [];
  for (let t = sim.bits + 1; t <= n; t++) marks.push(sim.preds[t] === sim.outs[t]);
  const okCount = marks.filter(Boolean).length;

  let status = "Pembangkit berjalan satu langkah demi satu langkah.";
  if (n > 0 && n < sim.bits) status = "Penyerang mencatat bit keluaran dan mengisi register tiruannya.";
  if (n >= sim.bits && marks.length > 0) {
    status = sim.hidden
      ? `Register tiruan terkunci, tetapi hanya ${okCount} dari ${marks.length} prediksi yang cocok. Pembangkitnya bukan LFSR, jadi modelnya salah.`
      : `Register tiruan terkunci. ${okCount} dari ${marks.length} prediksi cocok, karena rumusnya linear dan bisa disalin.`;
  }
  const bad = !sim.hidden;

  return (
    <div className="space-y-3">
      <div>
        <p className={`mb-1.5 ${SMALL}`}>
          {sim.hidden ? "Pembangkit sebenarnya (keadaan internal tertutup)" : `Register pembangkit (${sim.bits} bit, kotak biru = titik umpan balik)`}
        </p>
        {sim.hidden ? (
          <div className="rounded border border-dashed border-[#30363D] bg-[#0D1117] px-3 py-2 font-mono text-xs text-[#8B949E]">
            seed rahasia + penghitung, dihash setiap langkah
          </div>
        ) : (
          <Cells values={realCells} taps={sim.taps} cols={cols} />
        )}
      </div>

      <div>
        <p className={`mb-1.5 ${SMALL}`}>Bit keluaran yang diamati</p>
        <div className="flex min-h-5 flex-wrap gap-[3px]" aria-hidden="true">
          {stream.map((b, i) => (
            <span
              key={`${n}-${i}`}
              className="flex h-5 w-4 items-center justify-center rounded-[3px] font-mono text-[10px]"
              style={{ backgroundColor: b === 1 ? "#F0883E33" : "#0D1117", color: b === 1 ? ORANGE : "#8B949E", border: "1px solid #30363D" }}
            >
              {b}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className={`mb-1.5 ${SMALL}`}>
          Register tiruan penyerang{n >= sim.bits ? " (terkunci)" : ""}
        </p>
        <Cells values={cloneCells} cols={cols} />
      </div>

      {marks.length > 0 && (
        <div className="flex flex-wrap items-center gap-[3px]" aria-hidden="true">
          <span className={`mr-1 ${SMALL}`}>Prediksi:</span>
          {marks.slice(-20).map((ok, i) => (
            <span
              key={i}
              className="flex h-5 w-5 items-center justify-center rounded-[3px] text-[11px]"
              style={{ backgroundColor: ok ? "#F8514922" : "#3FB95022", color: ok ? RED : GREEN }}
            >
              {ok ? "✓" : "✗"}
            </span>
          ))}
        </div>
      )}
      <p className={`${CAPTION}`} style={{ color: n >= sim.bits && marks.length > 0 ? (bad ? "#FF7B72" : GREEN) : "#C9D1D9" }}>
        {status}
      </p>
    </div>
  );
}

/* ---- cycle: a short register runs out of states and repeats ---- */

const CYCLE_TICKS = 40;

function CycleView({ variant, token, run }: VizProps) {
  const gen = variant.gen;
  const period = useMemo(() => {
    if (!gen || gen.kind !== "lfsr" || gen.bits > 24) return null;
    const s0 = hexToBits(gen.seed, gen.bits);
    let s = s0;
    for (let i = 1; i <= 70000; i++) {
      s = lfsrNext(s, gen.taps).state;
      let same = true;
      for (let j = 0; j < s.length; j++) {
        if (s[j] !== s0[j]) {
          same = false;
          break;
        }
      }
      if (same) return i;
    }
    return null;
  }, [gen]);

  const n = useTicker(token, run, 70, CYCLE_TICKS);
  const bits = gen && gen.bits ? gen.bits : 256;
  const steps = period ? Math.round((period * n) / CYCLE_TICKS) : n * 250000000;
  const pct = period ? (n / CYCLE_TICKS) * 100 : 1.5;
  const done = period !== null && n >= CYCLE_TICKS;
  const seed = gen && gen.kind === "lfsr" ? gen.seed : "";

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-[#8B949E]">Langkah yang sudah dijalankan</span>
          <span className="font-mono text-[#E6EDF3]">{dots(steps)}</span>
        </div>
        <div className="h-3 overflow-hidden rounded bg-[#0D1117]">
          <div
            className="h-full rounded transition-[width,background-color] duration-100 motion-reduce:transition-none"
            style={{ width: `${pct}%`, backgroundColor: period ? (done ? RED : ORANGE) : GREEN }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-[#8B949E]" aria-hidden="true">
          <span>0</span>
          <span>{period ? `${dots(period)} langkah` : `2^${bits} langkah`}</span>
        </div>
      </div>
      <p className={CAPTION} style={{ color: done ? "#FF7B72" : period ? "#C9D1D9" : GREEN }}>
        {period
          ? done
            ? `Keadaan awal ${seed} muncul lagi setelah ${dots(period)} langkah. Urutan mulai berulang, jadi seluruh urutan bisa dipelajari dari satu siklus.`
            : "Register hanya punya sejumlah keadaan terbatas, jadi cepat atau lambat ia kembali ke keadaan awal."
          : `Siklusnya sekitar 2^${bits} langkah. Setelah ${dots(steps)} langkah pun belum ada tanda pengulangan, dan tidak akan pernah ada dalam waktu yang masuk akal.`}
      </p>
    </div>
  );
}

/* ---- rows: the same trial repeated, are the results identical? ---- */

function RowsView({ result, token, run, L }: VizProps) {
  const tape = result?.tape;
  const seen = tape ? tape.seen : [];
  const n = useTicker(token, run, 450, seen.length + 2);
  if (!tape) return <p className="text-sm text-[#8B949E]">{L.noTape}</p>;

  const parts = seen.map((s) => {
    const i = s.indexOf(": ");
    return i >= 0 ? s.slice(i + 2) : s;
  });
  const identical = parts.every((p) => p === parts[0]);
  const bad = result ? result.outcome !== "neutralized" : false;
  const verdictShown = n > seen.length;
  const gotShown = n > seen.length + 1;

  return (
    <div className="space-y-3">
      <div>
        <p className={`mb-1.5 ${SMALL}`}>{L.seenLabel}</p>
        <div className="flex flex-col gap-1.5">
          {seen.map((s, i) => (
            <span
              key={i}
              className="min-w-0 max-w-full self-start break-all rounded border bg-[#0D1117] px-2 py-1 font-mono text-xs transition-all duration-500 motion-reduce:transition-none"
              style={{
                opacity: i < n ? 1 : 0,
                transform: i < n ? "none" : "translateX(-16px)",
                borderColor: verdictShown ? (identical ? "#F8514966" : "#3FB95066") : "#30363D",
                color: verdictShown ? (identical ? "#FF7B72" : GREEN) : "#C9D1D9",
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>
      <p
        className={`${CAPTION} transition-opacity duration-500 motion-reduce:transition-none`}
        style={{ opacity: verdictShown ? 1 : 0, color: identical ? "#FF7B72" : GREEN }}
      >
        {identical ? "Hasilnya identik." : "Hasilnya berbeda."}
      </p>
      <div
        className="transition-opacity duration-500 motion-reduce:transition-none"
        style={{ opacity: gotShown ? 1 : 0 }}
      >
        <p className={`mb-1.5 ${SMALL}`}>{L.gotLabel}</p>
        <span
          className="inline-block max-w-full break-words rounded border px-2 py-1 font-mono text-xs"
          style={{
            borderColor: bad ? "#F8514966" : "#3FB95066",
            backgroundColor: bad ? "#F8514918" : "#3FB95018",
            color: bad ? "#FF7B72" : GREEN,
          }}
        >
          {tape.got}
        </span>
      </div>
    </div>
  );
}

/* ---- race: the same wordlist against three ways of storing a password ---- */

const WORDLIST = Math.pow(2, 20); // about one million common passwords
const LANES = [
  { id: "md5", label: "MD5 tanpa salt", rate: 1e10, color: RED },
  { id: "sha256", label: "SHA-256 tanpa salt", rate: 1e9, color: "#D29922" },
  { id: "argon2", label: "Argon2 dengan salt", rate: 100, color: GREEN },
];

function RaceView({ result, run }: VizProps) {
  const mine = result?.viz?.lane;
  return (
    <div className="space-y-3">
      <p className={SMALL}>
        Daftar yang sama berisi sekitar satu juta password umum dicoba ke tiga cara penyimpanan.
      </p>
      <div className="space-y-3">
        {LANES.map((l) => {
          const t = WORDLIST / l.rate;
          const ms = Math.round(700 + 520 * Math.log10(t / 1e-4));
          const isMine = mine === l.id;
          return (
            <div key={l.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span style={{ color: isMine ? ORANGE : "#8B949E" }}>
                  {l.label}
                  {isMine ? " (dipakai varian ini)" : ""}
                </span>
                <span
                  className="font-mono text-[#E6EDF3] transition-opacity duration-300 motion-reduce:transition-none"
                  style={{ opacity: run ? 1 : 0, transitionDelay: run ? `${ms}ms` : "0ms" }}
                >
                  {fmtTime(t)}
                </span>
              </div>
              <div
                className="h-3 overflow-hidden rounded bg-[#0D1117]"
                style={isMine ? { boxShadow: "0 0 0 1px #F0883E88" } : undefined}
              >
                <div
                  className="h-full rounded ease-out motion-reduce:transition-none"
                  style={{
                    width: run ? "100%" : "0%",
                    backgroundColor: l.color,
                    transitionProperty: "width",
                    transitionDuration: `${ms}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className={`${CAPTION} text-[#C9D1D9]`}>
        Selisih waktunya diperlihatkan dalam skala logaritmik. Hash cepat selesai hampir seketika,
        sedangkan hashing adaptif dengan salt membuat tiap tebakan mahal.
      </p>
    </div>
  );
}

/* ---- blocks: does the shape of the data survive encryption? ---- */

const LOCK = [
  "..####..",
  ".#....#.",
  ".#....#.",
  "########",
  "########",
  "###..###",
  "###..###",
  "########",
];
const PALETTE = ["#58A6FF", "#D29922", "#3FB950", "#F85149", "#BC8CFF", "#39C5CF", "#F0883E", "#8B949E"];

function BlocksView({ variant, payload, result, token, run }: VizProps) {
  const mode = result?.viz?.mode ?? "ecb";
  const bad = result ? result.outcome !== "neutralized" : false;
  const n = useTicker(token, run, 40, 64 + 6);
  const done = n >= 64;

  const cells = useMemo(() => {
    const out: { plain: boolean; color: string }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const plain = LOCK[r][c] === "#";
        let color: string;
        if (mode === "gcm") color = PALETTE[hashStr(`${variant.id}${payload.id}${r}${c}`) % PALETTE.length];
        else if (mode === "xor") color = PALETTE[(hashStr(`${plain ? 1 : 0}:${c % 3}`) + 2) % PALETTE.length];
        else color = plain ? "#58A6FF" : "#D29922";
        out.push({ plain, color });
      }
    }
    return out;
  }, [mode, variant.id, payload.id]);

  const grid = (colored: boolean) => (
    <div
      className="grid w-full max-w-[9rem] gap-[2px]"
      style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}
      aria-hidden="true"
    >
      {cells.map((cell, i) => (
        <span
          key={i}
          className="aspect-square rounded-[2px] transition-colors duration-300 motion-reduce:transition-none"
          style={{
            backgroundColor: colored
              ? i < n
                ? cell.color
                : "#21262D"
              : cell.plain
                ? "#E6EDF3"
                : "#0D1117",
            border: colored || cell.plain ? "1px solid transparent" : "1px solid #30363D",
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className={`mb-1.5 ${SMALL}`}>Data asli</p>
          {grid(false)}
        </div>
        <span className="text-[#8B949E]" aria-hidden="true">
          →
        </span>
        <div>
          <p className={`mb-1.5 ${SMALL}`}>Setelah dienkripsi</p>
          {grid(true)}
        </div>
      </div>
      <p
        className={`${CAPTION} transition-opacity duration-500 motion-reduce:transition-none`}
        style={{ opacity: done ? 1 : 0, color: bad ? "#FF7B72" : GREEN }}
      >
        {bad
          ? "Bentuk data asli masih terlihat, tanpa perlu kunci. Blok yang sama menghasilkan hasil yang sama."
          : "Tidak ada bentuk yang terlihat. Blok yang sama menghasilkan hasil yang berbeda."}
      </p>
    </div>
  );
}

/* ---- the panel itself ---- */

function VizPanel(props: VizProps & { onReplay: () => void }) {
  const { payload, result, L, onReplay } = props;
  const kind: VizKind = payload.viz ?? (result?.remaining !== undefined ? "window" : "rows");

  let body;
  if (!result) {
    body = (
      <p className="text-sm text-[#8B949E]">
        Hasil untuk skenario ini belum tersedia di implementasi ini.
      </p>
    );
  } else if (kind === "predict" || kind === "blind") {
    body = <TokenStream {...props} mode={kind} />;
  } else if (kind === "lfsr") body = <LfsrView {...props} />;
  else if (kind === "cycle") body = <CycleView {...props} />;
  else if (kind === "race") body = <RaceView {...props} />;
  else if (kind === "blocks") body = <BlocksView {...props} />;
  else if (kind === "rows") body = <RowsView {...props} />;
  else body = <SeedWindow {...props} />;

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
      <div key={props.token} className="flex flex-1 flex-col justify-center p-4">
        {body}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main renderer                                                       */
/* ------------------------------------------------------------------ */

const STEP_MS = 9000; // autoplay: how long the tour stays on each step

export default function EntropySimulation({ config }: { config: EntropyConfig }) {
  const { payloads, variants } = config;
  const L: Required<Labels> = { ...DEFAULT_LABELS, ...(config.labels ?? {}) };
  const maxBits = config.maxBits ?? 128;
  const defaultRate = config.rate ?? 1e9;

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

      {/* Code + search space (left)  |  how the attack works (right) */}
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
            <SpacePanel
              result={focusResult}
              payload={focusPayload}
              maxBits={maxBits}
              defaultRate={defaultRate}
              assembled={assembled}
              token={asmToken}
              L={L}
            />
          </div>
        </div>

        <div ref={animRef} className="min-w-0">
          <VizPanel
            variant={variant}
            payload={focusPayload}
            result={focusResult}
            token={asmToken}
            run={assembled}
            L={L}
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