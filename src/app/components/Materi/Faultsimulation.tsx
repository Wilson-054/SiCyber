"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Template "fault": satu komponen gagal, lihat akibatnya tergantung    */
/* implementasi. Viz dipilih dari data yang ada di result:              */
/*   decision (keputusan akses), ledger (state transaksi),              */
/*   response (apa yang dibaca penyerang), health (hidup/matinya proses)*/
/*   exposure (rahasia yang bisa dibaca + instalasi yang terbuka),      */
/*   session (urutan langkah penyerang, korban, server),                */
/*   compare (dua respons ditumpuk), network (paket menembus gerbang)   */
/* ------------------------------------------------------------------ */

type Outcome = "exploited" | "bypassed" | "neutralized";
type Tag = "vulnerable" | "weak" | "secure";

type NodeState = "ok" | "fail" | "skip";
type Decision = {
  verdict: "allow" | "deny";
  should: "allow" | "deny";
  allowLabel?: string;
  denyLabel?: string;
  nodes: { label: string; state: NodeState; note?: string }[];
};
type Ledger = {
  rows: { label: string; before: string; after: string; bad?: boolean }[];
  note?: string;
};
type ResponseView = {
  status: string;
  lines: { t: string; leak?: boolean }[];
  learned: string[];
};
type Cell = "ok" | "err" | "silent" | "crash" | "dead";
type Health = { timeline: Cell[]; alive: boolean };

type Exposure = {
  title?: string;
  lines: { t: string; leak?: boolean }[];
  installs?: { label: string; open: boolean }[];
  installsTitle?: string;
};
type SessionStep = {
  actor: "attacker" | "victim" | "server";
  text: string;
  sid?: string;
  bad?: boolean;
  blocked?: boolean; // langkah ini dihentikan oleh pertahanan (perisai hijau)
  cookie?: boolean; // browser menempelkan cookie secara otomatis (cookie terbang)
};
type SessionView = {
  steps: SessionStep[];
  attackerIn: boolean;
  vault?: string; // label brankas di akhir, bawaan "Akun korban"
  held?: string; // isi chip yang dipegang penyerang, bawaan sid terakhir penyerang
  chipLabel?: string; // awalan chip, bawaan "sid"
  verdictTitle?: string;
  verdictBad?: string;
  verdictGood?: string;
};

type Compare = {
  a: string; // judul kolom kiri, misalnya "Username terdaftar (sari)"
  b: string; // judul kolom kanan, misalnya "Username tidak ada (zzz)"
  rows: { label: string; a: string; b: string }[];
  yes?: string; // teks stempel bila ada baris yang berbeda
  no?: string; // teks stempel bila semua baris sama
};

type NetTarget = "public" | "redis" | "metadata" | "admin";
type Network = {
  url: string;
  target: NetTarget;
  gate: { label: string; state: "open" | "closed" | "none"; note?: string };
  passed: boolean; // true bila request benar-benar keluar dari server ke tujuan
  leaked?: string[];
};

type Payload = { id: string; raw: string; explains: string };
type Result = {
  outcome: Outcome;
  reason: string;
  label?: string;
  decision?: Decision;
  ledger?: Ledger;
  response?: ResponseView;
  health?: Health;
  exposure?: Exposure;
  session?: SessionView;
  compare?: Compare;
  network?: Network;
};
type Variant = {
  id: string;
  tag: Tag;
  label: string;
  code: string;
  explanation: string;
  results: Record<string, Result | undefined>;
};
type TourStep = { variant: string; focus?: string; caption: string };
type Rule = { title: string; text: string; proof: string };

const DEFAULT_LABELS = {
  list: "Skenario",
  listHint: "(ketuk untuk detail)",
  detail: "Latar skenario",
  allSafe: "Semua {total} skenario berakhir aman",
  someBad: "{n} dari {total} skenario berujung bahaya",
  legendBad: "berujung bahaya",
  legendGood: "aman / berjalan normal",
  vizTitle: "Apa yang terjadi",
  vizHint: "ketuk skenario lain untuk mengganti",
  disclaimer:
    "Visualisasi ini menggambarkan konsep, bukan simulasi sistem nyata. Nama, angka, dan perilaku runtime hanyalah contoh.",
};
type Labels = Partial<typeof DEFAULT_LABELS>;

export type FaultConfig = {
  payloads: Payload[];
  variants: Variant[];
  tour?: TourStep[];
  rules?: Rule[];
  labels?: Labels;
};

const TAG: Record<Tag, { label: string; cls: string; color: string }> = {
  vulnerable: { label: "Rentan", cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]", color: "#F85149" },
  weak: { label: "Lemah", cls: "border-[#D29922]/40 bg-[#D29922]/10 text-[#D29922]", color: "#D29922" },
  secure: { label: "Aman", cls: "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]", color: "#3FB950" },
};

type OutcomeStyle = { label: string; cls: string; color: string };
const OUTCOME: Record<string, OutcomeStyle> = {
  exploited: { label: "Tereksploitasi", cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]", color: "#F85149" },
  bypassed: { label: "Lolos filter", cls: "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]", color: "#F85149" },
  neutralized: { label: "Dinetralkan", cls: "border-[#3FB950]/40 bg-[#3FB950]/10 text-[#3FB950]", color: "#3FB950" },
};

const RED = "#F85149";
const GREEN = "#3FB950";
const AMBER = "#D29922";
const STEP_MS = 9000;

export function isFaultConfig(c: unknown): c is FaultConfig {
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
/* Animation helpers                                                   */
/* ------------------------------------------------------------------ */

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
/* Visualisasi                                                         */
/* ------------------------------------------------------------------ */

type VizProps = {
  payload: Payload;
  result: Result;
  token: string;
  run: boolean;
};

const CAPTION = "text-sm leading-relaxed";
const SMALL = "text-xs text-[#8B949E]";
const FADE = "transition-all duration-500 motion-reduce:transition-none";
const BLUE = "#58A6FF";
const ACCENT = "#F0883E";
const SOFT_RED = "#FF7B72";

/* Semua keyframe ada di sini supaya komponen tetap satu berkas dan tanpa
   konfigurasi Tailwind tambahan. Kelas "fx-anim" dimatikan oleh sistem
   operasi yang meminta gerakan dikurangi. */
const FX_CSS = `
@keyframes fx-shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-8px)}30%{transform:translateX(7px)}45%{transform:translateX(-6px)}60%{transform:translateX(5px)}75%{transform:translateX(-2px)}}
@keyframes fx-pop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.3);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes fx-slam{0%{transform:scale(3) rotate(-10deg);opacity:0}55%{transform:scale(.9) rotate(-3deg);opacity:1}75%{transform:scale(1.06) rotate(-3deg)}100%{transform:scale(1) rotate(-3deg);opacity:1}}
@keyframes fx-ping{0%{transform:scale(.5);opacity:.9}100%{transform:scale(2.8);opacity:0}}
@keyframes fx-glow-red{0%,100%{box-shadow:0 0 0 0 rgba(248,81,73,0)}50%{box-shadow:0 0 26px 5px rgba(248,81,73,.6)}}
@keyframes fx-glow-green{0%,100%{box-shadow:0 0 0 0 rgba(63,185,80,0)}50%{box-shadow:0 0 22px 4px rgba(63,185,80,.5)}}
@keyframes fx-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes fx-reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes fx-sweep{0%{transform:translateX(-130%)}100%{transform:translateX(260%)}}
@keyframes fx-scan{0%{top:-6%}100%{top:104%}}
@keyframes fx-dash{to{stroke-dashoffset:-24}}
@keyframes fx-slide{from{transform:translateX(-18px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes fx-rise{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes fx-travel{0%{top:-2px;opacity:0}20%{opacity:1}80%{opacity:1}100%{top:calc(100% - 8px);opacity:0}}
@keyframes fx-flash{0%{opacity:.75}100%{opacity:0}}
@keyframes fx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes fx-fly{0%{transform:translateX(0);opacity:0}15%{opacity:1}100%{transform:translateX(70px);opacity:0}}
@keyframes fx-bounce-back{0%{transform:translateX(0)}40%{transform:translateX(14px)}100%{transform:translateX(0)}}
@keyframes fx-wobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@media (prefers-reduced-motion: reduce){.fx-anim{animation:none!important}}
`;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useCountUp(from: number, to: number, run: boolean, ms = 1000) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!run || from === to || reducedMotion()) {
      setV(run ? to : from);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run, ms]);
  return v;
}

function parseNum(s: string): number | null {
  if (!/^-?\d{1,3}(\.\d{3})+$|^-?\d+$/.test(s.trim())) return null;
  return Number(s.trim().replace(/\./g, ""));
}
function fmtNum(v: number): string {
  return v.toLocaleString("id-ID");
}

/* ---- ikon kecil (SVG murni) ---- */

function LockIcon({ open, color, size = 22 }: { open: boolean; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill={color + "26"} />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        style={{ transformOrigin: "16px 11px", transform: open ? "rotate(38deg) translateY(-3px)" : "none", transition: "transform .6s cubic-bezier(.2,.9,.2,1)" }}
      />
      <circle cx="12" cy="16" r="1.3" fill={color} stroke="none" />
    </svg>
  );
}

function ShieldIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" fill={color + "26"} />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function CookieIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-9-9 4 4 0 0 0 5 5 3 3 0 0 0 4 4z" fill={color + "26"} />
      <circle cx="9" cy="10" r=".8" fill={color} />
      <circle cx="14" cy="15" r=".8" fill={color} />
      <circle cx="8" cy="15" r=".8" fill={color} />
    </svg>
  );
}

function PersonIcon({ color, kind, size = 30 }: { color: string; kind: "attacker" | "victim" | "server" | "ghost"; size?: number }) {
  if (kind === "server") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <rect x="5" y="5" width="22" height="9" rx="2" fill={color + "22"} />
        <rect x="5" y="18" width="22" height="9" rx="2" fill={color + "22"} />
        <circle cx="10" cy="9.5" r="1" fill={color} />
        <circle cx="10" cy="22.5" r="1" fill={color} />
      </svg>
    );
  }
  if (kind === "ghost") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 27V15a9 9 0 0 1 18 0v12l-3-2-3 2-3-2-3 2-3-2z" fill={color + "22"} />
        <circle cx="12.5" cy="15" r="1.2" fill={color} />
        <circle cx="19.5" cy="15" r="1.2" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="16" cy="11" r="5" fill={color + "22"} />
      <path d="M6 27c0-6 4.5-9 10-9s10 3 10 9" fill={color + "22"} />
      {kind === "attacker" && <path d="M11 11h10" strokeWidth="3.5" />}
    </svg>
  );
}

/* ---- decision: paket data berjalan melewati komponen, lalu menabrak gerbang ---- */

function Gate({ open, bad, show }: { open: boolean; bad: boolean; show: boolean }) {
  const c = bad ? RED : GREEN;
  const shift = open && show ? 46 : 0;
  const ease = "transform .9s cubic-bezier(.2,.9,.2,1)";
  return (
    <svg viewBox="0 0 260 150" className="mx-auto w-full max-w-[340px]" role="img" aria-label={open ? "Gerbang terbuka" : "Gerbang tertutup"}>
      <rect x="92" y="22" width="76" height="70" rx="8" fill="#0D1117" stroke={c + "88"} strokeDasharray="4 4" />
      <text x="130" y="55" textAnchor="middle" fill={c} fontSize="12" fontFamily="monospace" fontWeight="700">
        DATA
      </text>
      <text x="130" y="72" textAnchor="middle" fill="#8B949E" fontSize="9">
        sumber daya
      </text>
      {open && show && (
        <g>
          <line x1="130" y1="104" x2="130" y2="136" stroke={c} strokeWidth="3" strokeDasharray="6 6" className="fx-anim" style={{ animation: "fx-dash .5s linear infinite" }} />
          <polygon points="130,146 122,134 138,134" fill={c} />
        </g>
      )}
      <g style={{ transform: `translateX(${-shift}px)`, transition: ease }}>
        <rect x="52" y="14" width="78" height="86" rx="6" fill="#161B22" stroke={c} strokeWidth="2.5" />
        <line x1="66" y1="30" x2="116" y2="30" stroke={c + "55"} strokeWidth="2" />
        <line x1="66" y1="48" x2="116" y2="48" stroke={c + "55"} strokeWidth="2" />
        <line x1="66" y1="66" x2="116" y2="66" stroke={c + "55"} strokeWidth="2" />
        <line x1="66" y1="84" x2="116" y2="84" stroke={c + "55"} strokeWidth="2" />
      </g>
      <g style={{ transform: `translateX(${shift}px)`, transition: ease }}>
        <rect x="130" y="14" width="78" height="86" rx="6" fill="#161B22" stroke={c} strokeWidth="2.5" />
        <line x1="144" y1="30" x2="194" y2="30" stroke={c + "55"} strokeWidth="2" />
        <line x1="144" y1="48" x2="194" y2="48" stroke={c + "55"} strokeWidth="2" />
        <line x1="144" y1="66" x2="194" y2="66" stroke={c + "55"} strokeWidth="2" />
        <line x1="144" y1="84" x2="194" y2="84" stroke={c + "55"} strokeWidth="2" />
      </g>
      {!open && show && (
        <g className="fx-anim" style={{ animation: "fx-pop .5s both", transformOrigin: "130px 57px" }}>
          <circle cx="130" cy="57" r="15" fill="#0D1117" stroke={c} strokeWidth="2.5" />
          <rect x="123" y="56" width="14" height="10" rx="2" fill={c} />
          <path d="M126 56v-4a4 4 0 0 1 8 0v4" fill="none" stroke={c} strokeWidth="2.5" />
        </g>
      )}
    </svg>
  );
}

function DecisionViz({ result, token, run }: VizProps) {
  const d = result.decision as Decision;
  const nn = d.nodes.length;
  const n = useTicker(token, run, 950, nn + 2);
  const bad = result.outcome !== "neutralized";
  const allow = d.verdict === "allow";
  const gateShown = n >= nn;
  const verdictShown = n >= nn + 1;
  const vc = bad ? RED : GREEN;
  const sc = (s: NodeState) => (s === "ok" ? GREEN : s === "fail" ? RED : "#6E7681");
  const stText = (s: NodeState) => (s === "ok" ? "berfungsi" : s === "fail" ? "gagal" : "dilewati");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
        {/* paket pertama: request masuk */}
        {d.nodes.map((node, i) => {
          const shown = n >= i;
          const color = sc(node.state);
          const failed = node.state === "fail";
          return (
            <div key={i} className="contents">
              <div className="relative flex flex-col items-center">
                <span
                  className="fx-anim relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold"
                  style={{
                    borderColor: shown ? color : "#30363D",
                    color,
                    backgroundColor: shown ? color + "26" : "#0D1117",
                    opacity: shown ? 1 : 0.25,
                    animation: shown ? (failed ? "fx-shake .55s both" : "fx-pop .45s both") : "none",
                  }}
                >
                  {node.state === "ok" ? "✓" : node.state === "fail" ? "✕" : "–"}
                </span>
                {shown && failed && (
                  <span
                    className="fx-anim absolute top-0 h-8 w-8 rounded-full border-2"
                    style={{ borderColor: RED, animation: "fx-ping 1s ease-out 2" }}
                  />
                )}
              </div>
              <div
                className={`fx-anim mb-1 rounded-md border bg-[#0D1117] px-3 py-2 ${FADE}`}
                style={{
                  opacity: shown ? 1 : 0.15,
                  transform: shown ? "none" : "translateX(10px)",
                  borderColor: shown ? color + "99" : "#21262D",
                  animation: shown && failed ? "fx-glow-red 1.2s ease-in-out 2" : "none",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#E6EDF3]">{node.label}</span>
                  <span className="text-xs" style={{ color }}>
                    {stText(node.state)}
                  </span>
                </div>
                {node.note && <p className="mt-0.5 break-words text-xs text-[#8B949E]">{node.note}</p>}
              </div>
              {/* rel antar node dengan paket yang berjalan */}
              <div className="relative mx-auto h-7 w-0.5 bg-[#21262D]">
                {n >= i + 1 && (
                  <span
                    key={`dot-${token}-${i}`}
                    className="fx-anim absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                    style={{ backgroundColor: ACCENT, boxShadow: `0 0 10px 2px ${ACCENT}`, animation: "fx-travel .75s ease-in both" }}
                  />
                )}
              </div>
              <div />
            </div>
          );
        })}
      </div>

      <div
        className={`fx-anim rounded-lg border bg-[#0D1117] px-3 pb-3 pt-2 ${FADE}`}
        style={{
          opacity: gateShown ? 1 : 0.2,
          borderColor: verdictShown ? vc : "#21262D",
          animation: verdictShown ? (bad ? "fx-glow-red 1.3s ease-in-out 3" : "fx-glow-green 1.3s ease-in-out 2") : "none",
        }}
      >
        <Gate open={allow} bad={bad} show={verdictShown} />
        <div className="text-center">
          <p className={SMALL}>Keputusan sistem</p>
          <p
            key={`v-${token}`}
            className="fx-anim font-mono text-lg font-semibold"
            style={{
              color: vc,
              opacity: verdictShown ? 1 : 0,
              animation: verdictShown ? (bad ? "fx-shake .6s both" : "fx-pop .5s both") : "none",
            }}
          >
            {allow ? d.allowLabel ?? "ALLOW (akses diberikan)" : d.denyLabel ?? "DENY (akses ditolak)"}
          </p>
          <p className="mt-1 text-xs text-[#8B949E]">Seharusnya: {d.should === "allow" ? "ALLOW" : "DENY"}</p>
        </div>
      </div>
      <p className={`${CAPTION} ${FADE}`} style={{ opacity: verdictShown ? 1 : 0, color: vc }}>
        {result.reason}
      </p>
    </div>
  );
}

/* ---- ledger: angka berhitung, batang saldo bergeser ---- */

function LedgerRow({ row, shown, max }: { row: Ledger["rows"][number]; shown: boolean; max: number }) {
  const b = parseNum(row.before);
  const a = parseNum(row.after);
  const numeric = b !== null && a !== null;
  const val = useCountUp(b ?? 0, a ?? 0, shown && numeric, 1100);
  const changed = row.before !== row.after;
  const color = row.bad ? RED : changed ? "#C9D1D9" : GREEN;
  const pct = (v: number) => (max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0);
  return (
    <div className="contents">
      <span className="py-1 font-sans text-[#C9D1D9]">{row.label}</span>
      <span className="min-w-0 break-words rounded border border-[#30363D] bg-[#0D1117] px-2 py-1 text-[#8B949E]">{row.before}</span>
      <span
        className={`fx-anim relative min-w-0 break-words rounded border px-2 py-1 ${FADE}`}
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "translateY(6px)",
          borderColor: row.bad ? "#F8514988" : "#30363D",
          backgroundColor: row.bad ? "#F8514918" : "#0D1117",
          color,
          animation: shown && row.bad ? "fx-shake .6s both, fx-glow-red 1.2s ease-in-out 2" : "none",
        }}
      >
        {numeric ? fmtNum(val) : row.after}
        {numeric && (
          <span className="mt-1 block h-1.5 overflow-hidden rounded bg-[#21262D]">
            <span
              className="block h-full rounded"
              style={{
                width: `${shown ? pct(a as number) : pct(b as number)}%`,
                backgroundColor: row.bad ? RED : changed ? ACCENT : GREEN,
                transition: "width 1.1s cubic-bezier(.2,.9,.2,1)",
              }}
            />
          </span>
        )}
      </span>
    </div>
  );
}

function LedgerViz({ result, token, run }: VizProps) {
  const l = result.ledger as Ledger;
  const n = useTicker(token, run, 600, l.rows.length + 1);
  const bad = result.outcome !== "neutralized";
  const done = n > l.rows.length;
  const nums: number[] = [];
  l.rows.forEach((r) => {
    const b = parseNum(r.before);
    const a = parseNum(r.after);
    if (b !== null) nums.push(b);
    if (a !== null) nums.push(a);
  });
  const max = nums.length ? Math.max(...nums) : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 font-mono text-xs">
        <span className={`${SMALL} font-sans`}>Data</span>
        <span className={`${SMALL} font-sans`}>Sebelum</span>
        <span className={`${SMALL} font-sans`}>Sesudah</span>
        {l.rows.map((r, i) => (
          <LedgerRow key={i} row={r} shown={i < n} max={max} />
        ))}
      </div>
      {l.note && (
        <p className={`${CAPTION} text-[#8B949E] ${FADE}`} style={{ opacity: done ? 1 : 0 }}>
          {l.note}
        </p>
      )}
      <p className={`${CAPTION} ${FADE}`} style={{ opacity: done ? 1 : 0, color: bad ? SOFT_RED : GREEN }}>
        {result.reason}
      </p>
    </div>
  );
}

/* ---- response: terminal yang mengetik, buku catatan penyerang ---- */

function TerminalChrome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#30363D] bg-[#0D1117]">
      <div className="flex items-center gap-1.5 border-b border-[#21262D] bg-[#161B22] px-3 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#F85149]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#D29922]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3FB950]" />
        <span className="ml-2 min-w-0 flex-1 truncate font-mono text-[11px] text-[#8B949E]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ResponseViz({ payload, result, token, run }: VizProps) {
  const r = result.response as ResponseView;
  const n = useTicker(token, run, 520, r.lines.length + r.learned.length + 2);
  const bad = result.outcome !== "neutralized";
  const leaks = r.lines.filter((l) => l.leak).length;
  const learnedStart = r.lines.length + 1;
  const done = n >= learnedStart + r.learned.length;
  const lastShownLine = Math.min(n, r.lines.length) - 1;

  return (
    <div className="space-y-3">
      <TerminalChrome title="penyerang@kali: ~">
        <div className="space-y-1 p-3 font-mono text-xs">
          <p className="break-all text-[#E6EDF3]">
            <span className="text-[#3FB950]">$ </span>
            {payload.raw}
          </p>
          <p
            className="fx-anim"
            style={{
              opacity: n >= 1 ? 1 : 0,
              color: bad ? SOFT_RED : GREEN,
              animation: n >= 1 ? "fx-reveal .5s steps(20) both" : "none",
            }}
          >
            {r.status}
          </p>
          {r.lines.map((l, i) => {
            const shown = i + 1 < n;
            return (
              <p
                key={i}
                className="fx-anim relative mt-1 overflow-hidden whitespace-pre-wrap break-all rounded px-1"
                style={{
                  opacity: shown ? 1 : 0,
                  color: l.leak ? SOFT_RED : "#C9D1D9",
                  backgroundColor: l.leak ? "#F8514922" : "transparent",
                  animation: shown ? `fx-reveal ${0.35 + Math.min(l.t.length, 60) / 150}s steps(28) both` : "none",
                }}
              >
                {l.t}
                {shown && l.leak && (
                  <span
                    className="fx-anim pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#F85149]/40 to-transparent"
                    style={{ animation: "fx-sweep .9s ease-out .2s both" }}
                  />
                )}
                {i === lastShownLine && !done && (
                  <span className="fx-anim ml-0.5 inline-block h-3 w-1.5 bg-[#C9D1D9] align-middle" style={{ animation: "fx-blink 1s steps(1) infinite" }} />
                )}
              </p>
            );
          })}
        </div>
      </TerminalChrome>
      <p className="text-[11px] text-[#8B949E]">
        <span style={{ color: SOFT_RED }}>merah</span>: informasi yang seharusnya tidak sampai ke pengguna
        {leaks === 0 ? " (tidak ada pada respons ini)" : ""}
      </p>

      <div className="rounded-lg border border-dashed border-[#30363D] bg-[#161B22] p-3">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-[#C9D1D9]">
          <PersonIcon color={SOFT_RED} kind="attacker" size={20} />
          Catatan penyerang
        </p>
        {r.learned.length === 0 ? (
          <p
            className={`fx-anim flex items-center gap-2 text-sm ${FADE}`}
            style={{ opacity: n >= learnedStart ? 1 : 0, color: GREEN, animation: n >= learnedStart ? "fx-pop .5s both" : "none" }}
          >
            <ShieldIcon color={GREEN} />
            Tidak ada informasi baru.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.learned.map((x, i) => {
              const shown = learnedStart + i < n;
              return (
                <span
                  key={i}
                  className="fx-anim rounded border border-[#F85149]/60 bg-[#F85149]/15 px-2 py-1 text-xs font-medium text-[#FF7B72]"
                  style={{
                    opacity: shown ? 1 : 0,
                    transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)`,
                    animation: shown ? "fx-slam .5s both" : "none",
                  }}
                >
                  {x}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <p className={`${CAPTION} ${FADE}`} style={{ opacity: done ? 1 : 0, color: bad ? SOFT_RED : GREEN }}>
        {result.reason}
      </p>
    </div>
  );
}

/* ---- health: detak jantung server ---- */

const CELL_STYLE: Record<Cell, { bg: string; label: string }> = {
  ok: { bg: GREEN, label: "berhasil" },
  err: { bg: BLUE, label: "error ditangani" },
  silent: { bg: AMBER, label: "sukses semu" },
  crash: { bg: RED, label: "proses crash" },
  dead: { bg: "#484F58", label: "tidak dilayani" },
};

const ECG_W = 44;
function ecgPath(c: Cell, x0: number): string {
  const y = 34;
  switch (c) {
    case "ok":
      return `M${x0},${y} h6 l4,-18 l6,36 l4,-26 l4,8 h${ECG_W - 24}`;
    case "err":
      return `M${x0},${y} h10 l5,-9 l5,18 l5,-9 h${ECG_W - 25}`;
    case "silent":
      return `M${x0},${y} h8 l4,-9 l5,18 l4,-9 h${ECG_W - 21}`;
    case "crash":
      return `M${x0},${y} h6 l4,-32 l8,64 l4,-32 h${ECG_W - 22}`;
    default:
      return `M${x0},${y} h${ECG_W}`;
  }
}
function ecgColor(c: Cell): string {
  return c === "dead" ? "#6E7681" : CELL_STYLE[c].bg;
}

function HealthViz({ result, token, run }: VizProps) {
  const h = result.health as Health;
  const n = useTicker(token, run, 420, h.timeline.length + 1);
  const bad = result.outcome !== "neutralized";
  const done = n > h.timeline.length;
  const hasSilent = h.timeline.includes("silent");
  const color = bad ? SOFT_RED : GREEN;

  const used = Array.from(new Set(h.timeline));
  const shownCells = Math.min(n, h.timeline.length);
  const lastShown = shownCells > 0 ? h.timeline[shownCells - 1] : undefined;
  const shownSoFar = h.timeline.slice(0, shownCells);
  const crashedNow = shownSoFar.includes("crash");
  // Proses hidup tetapi tidak melayani (misalnya pool sumber daya habis).
  const stalledNow = !crashedNow && shownSoFar.includes("dead");
  const statusColor = crashedNow ? RED : stalledNow ? AMBER : GREEN;
  const statusText = crashedNow
    ? "MATI. Semua request berikutnya gagal, termasuk dari pengguna sah."
    : stalledNow
      ? "HIDUP, tetapi tidak melayani request. Sumber daya habis, pengguna sah ikut tertahan."
      : lastShown
        ? "HIDUP"
        : "...";
  const W = ECG_W * h.timeline.length;

  return (
    <div className="space-y-3">
      <div
        className="fx-anim relative overflow-hidden rounded-lg border bg-[#0D1117] p-3"
        style={{
          borderColor: crashedNow ? RED : stalledNow ? AMBER : "#30363D",
          animation: crashedNow ? "fx-shake .6s both" : "none",
        }}
      >
        {crashedNow && (
          <span
            key={`flash-${token}`}
            className="fx-anim pointer-events-none absolute inset-0 bg-[#F85149]"
            style={{ animation: "fx-flash 1s ease-out both" }}
          />
        )}
        <div className="flex items-center gap-3">
          <div className="relative">
            <PersonIcon color={crashedNow ? RED : stalledNow ? AMBER : GREEN} kind="server" size={40} />
            <span
              className="fx-anim absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full"
              style={{
                backgroundColor: statusColor,
                boxShadow: `0 0 10px 2px ${statusColor}`,
                animation: crashedNow ? "none" : stalledNow ? "fx-blink .8s steps(1) infinite" : "fx-glow-green 1.4s ease-in-out infinite",
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={SMALL}>Status proses server</p>
            <p className="text-sm font-medium" style={{ color: crashedNow ? SOFT_RED : statusColor }}>
              {statusText}
            </p>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} 68`} className="mt-3 w-full" role="img" aria-label="Detak server dari waktu ke waktu" preserveAspectRatio="none" style={{ height: 70 }}>
          <line x1="0" y1="34" x2={W} y2="34" stroke="#21262D" strokeWidth="1" strokeDasharray="3 4" />
          {h.timeline.map((c, i) => (
            <path
              key={i}
              d={ecgPath(c, i * ECG_W)}
              pathLength={1}
              fill="none"
              stroke={ecgColor(c)}
              strokeWidth={c === "crash" ? 3 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{
                strokeDasharray: 1,
                strokeDashoffset: i < n ? 0 : 1,
                transition: "stroke-dashoffset .4s linear",
                filter: i < n ? `drop-shadow(0 0 3px ${ecgColor(c)})` : "none",
              }}
            />
          ))}
        </svg>
      </div>

      <div>
        <p className={`mb-1.5 ${SMALL}`}>Request ke server (kiri ke kanan)</p>
        <div className="flex flex-wrap gap-1.5" role="img" aria-label="Aliran request dan hasil tiap request">
          {h.timeline.map((c, i) => (
            <span
              key={i}
              title={CELL_STYLE[c].label}
              className={`fx-anim flex h-7 w-7 items-center justify-center rounded text-[11px] font-bold text-[#0D1117] ${FADE}`}
              style={{
                backgroundColor: i < n ? CELL_STYLE[c].bg : "#21262D",
                transform: i < n && c === "crash" ? "scale(1.2)" : "none",
                animation: i + 1 === n ? (c === "crash" ? "fx-shake .5s both" : "fx-pop .35s both") : "none",
              }}
            >
              {i < n ? (c === "crash" ? "✕" : c === "dead" ? "–" : c === "err" ? "!" : c === "silent" ? "?" : "✓") : ""}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#8B949E]">
          {used.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CELL_STYLE[c].bg }} />
              {CELL_STYLE[c].label}
            </span>
          ))}
        </div>
      </div>

      <p className={`${CAPTION} ${FADE}`} style={{ opacity: done ? 1 : 0, color }}>
        {result.reason}
        {done && hasSilent ? " Kotak kuning: request tampak sukses padahal datanya salah." : ""}
      </p>
    </div>
  );
}

/* ---- exposure: pemindaian binary, lalu instalasi terbuka seperti domino ---- */

function ExposureViz({ result, token, run }: VizProps) {
  const e = result.exposure as Exposure;
  const installs = e.installs ?? [];
  const n = useTicker(token, run, 520, e.lines.length + installs.length + 1);
  const bad = result.outcome !== "neutralized";
  const done = n > e.lines.length + installs.length;
  const scanning = n < e.lines.length;
  const openTotal = installs.filter((x) => x.open).length;
  const shownInstalls = Math.max(0, Math.min(installs.length, n - e.lines.length));
  const openShown = installs.slice(0, shownInstalls).filter((x) => x.open).length;
  const counter = useCountUp(0, openShown, true, 500);

  return (
    <div className="space-y-3">
      <TerminalChrome title={e.title ?? "terminal"}>
        <div className="relative space-y-1 p-3 font-mono text-xs">
          {scanning && (
            <span
              className="fx-anim pointer-events-none absolute inset-x-0 h-6 bg-gradient-to-b from-transparent via-[#3FB950]/25 to-transparent"
              style={{ animation: "fx-scan 1.2s linear infinite" }}
            />
          )}
          {e.lines.map((ln, i) => {
            const shown = i < n;
            return (
              <p
                key={i}
                className="fx-anim relative overflow-hidden break-all rounded px-1"
                style={{
                  opacity: shown ? 1 : 0,
                  color: ln.leak ? SOFT_RED : "#8B949E",
                  fontWeight: ln.leak ? 700 : 400,
                  backgroundColor: ln.leak && shown ? "#F8514922" : "transparent",
                  animation: shown ? "fx-reveal .45s steps(24) both" : "none",
                }}
              >
                {ln.t}
                {shown && ln.leak && (
                  <span
                    className="fx-anim pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#F85149]/45 to-transparent"
                    style={{ animation: "fx-sweep .9s ease-out .2s both" }}
                  />
                )}
              </p>
            );
          })}
        </div>
      </TerminalChrome>

      {installs.length > 0 && (
        <div>
          <p className={`mb-1.5 flex items-center justify-between ${SMALL}`}>
            <span>{e.installsTitle ?? "Instalasi di organisasi lain"}</span>
            <span className="font-mono" style={{ color: openTotal > 0 ? SOFT_RED : GREEN }}>
              {counter} dari {installs.length} terbuka
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {installs.map((ins, i) => {
              const shown = e.lines.length + i < n;
              const c = !shown ? "#30363D" : ins.open ? RED : GREEN;
              return (
                <div
                  key={i}
                  className={`fx-anim relative rounded-md border px-2 py-2 text-xs ${FADE}`}
                  style={{
                    borderColor: c,
                    backgroundColor: shown ? c + "1F" : "#0D1117",
                    animation: shown && ins.open ? "fx-shake .5s both" : "none",
                  }}
                >
                  {shown && ins.open && (
                    <span className="fx-anim pointer-events-none absolute inset-0 rounded-md border-2" style={{ borderColor: RED, animation: "fx-ping 1s ease-out both" }} />
                  )}
                  <div className="flex items-center gap-2">
                    {shown ? <LockIcon open={ins.open} color={ins.open ? RED : GREEN} size={20} /> : <LockIcon open={false} color="#6E7681" size={20} />}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#E6EDF3]">{ins.label}</p>
                      <p style={{ color: shown ? (ins.open ? SOFT_RED : GREEN) : "#8B949E" }}>{!shown ? "..." : ins.open ? "terbuka" : "tetap aman"}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className={`${CAPTION} ${FADE}`} style={{ opacity: done ? 1 : 0, color: bad ? SOFT_RED : GREEN }}>
        {result.reason}
      </p>
    </div>
  );
}

/* ---- session: lini waktu aktor, chip yang berpindah, brankas di akhir ---- */

const ACTOR: Record<SessionStep["actor"], { label: string; color: string }> = {
  attacker: { label: "Penyerang", color: SOFT_RED },
  victim: { label: "Korban", color: BLUE },
  server: { label: "Server", color: "#8B949E" },
};

function SessionViz({ result, token, run }: VizProps) {
  const v = result.session as SessionView;
  const n = useTicker(token, run, 900, v.steps.length + 2);
  const bad = result.outcome !== "neutralized";
  const stepsDone = n >= v.steps.length;
  const sceneShown = n >= v.steps.length + 1;
  const vc = v.attackerIn ? RED : GREEN;
  const chipLabel = v.chipLabel ?? "sid";
  const lastAttacker = [...v.steps].reverse().find((s) => s.actor === "attacker" && s.sid);
  const held = v.held ?? lastAttacker?.sid ?? "-";

  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
        {v.steps.map((st, i) => {
          const shown = n >= i;
          const a = ACTOR[st.actor];
          const last = i === v.steps.length - 1;
          return (
            <li key={i} className="contents">
              <div className="relative flex flex-col items-center">
                <span
                  className="fx-anim relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor: shown ? (st.bad ? RED : a.color) : "#30363D",
                    backgroundColor: "#0D1117",
                    opacity: shown ? 1 : 0.25,
                    animation: shown ? "fx-pop .45s both" : "none",
                  }}
                >
                  <PersonIcon color={st.bad ? RED : a.color} kind={st.actor} size={18} />
                </span>
                {!last && (
                  <span className="relative mt-0.5 w-0.5 flex-1 bg-[#21262D]">
                    {n >= i + 1 && (
                      <span
                        key={`dot-${token}-${i}`}
                        className="fx-anim absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
                        style={{ backgroundColor: ACCENT, boxShadow: `0 0 8px 2px ${ACCENT}`, animation: "fx-travel .8s ease-in both" }}
                      />
                    )}
                  </span>
                )}
              </div>
              <div
                className="fx-anim relative mb-2 overflow-hidden rounded-md border bg-[#0D1117] px-3 py-2"
                style={{
                  opacity: shown ? 1 : 0,
                  borderColor: shown ? (st.bad ? RED + "99" : "#30363D") : "#21262D",
                  animation: shown ? (st.bad ? "fx-slide .45s both, fx-glow-red 1.2s ease-in-out 2 .3s" : "fx-slide .45s both") : "none",
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ color: a.color, backgroundColor: a.color + "22" }}>
                    {a.label}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-[#E6EDF3]">{st.text}</span>
                  {st.blocked && (
                    <span
                      className="fx-anim flex items-center gap-1 rounded border border-[#3FB950]/60 bg-[#3FB950]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#3FB950]"
                      style={{ animation: shown ? "fx-slam .5s .3s both" : "none" }}
                    >
                      <ShieldIcon color={GREEN} size={13} />
                      diblokir
                    </span>
                  )}
                </div>
                {st.sid && (
                  <p
                    className="fx-anim mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px]"
                    style={{
                      color: st.bad ? SOFT_RED : "#8B949E",
                      borderColor: st.bad ? "#F8514988" : "#30363D",
                      backgroundColor: st.bad ? "#F8514915" : "#161B22",
                      animation: shown && st.bad ? "fx-wobble .6s ease-in-out 2" : "none",
                    }}
                  >
                    <CookieIcon color={st.bad ? RED : "#8B949E"} size={14} />
                    <span className="min-w-0 break-all">
                      {chipLabel} = {st.sid}
                    </span>
                  </p>
                )}
                {st.cookie && shown && (
                  <span className="fx-anim pointer-events-none absolute right-3 top-2" style={{ animation: "fx-fly 1.1s ease-in .3s both" }}>
                    <CookieIcon color={AMBER} size={18} />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div
        className={`fx-anim rounded-lg border bg-[#0D1117] p-3 ${FADE}`}
        style={{
          opacity: stepsDone ? 1 : 0.15,
          borderColor: sceneShown ? vc : "#21262D",
          animation: sceneShown ? (v.attackerIn ? "fx-glow-red 1.3s ease-in-out 3" : "fx-glow-green 1.3s ease-in-out 2") : "none",
        }}
      >
        <p className={`mb-2 ${SMALL}`}>{v.verdictTitle ?? "ID sesi yang dipegang penyerang"}</p>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1">
            <PersonIcon color={SOFT_RED} kind="attacker" size={34} />
            <span className="max-w-[7.5rem] truncate rounded-full border border-[#F85149]/50 bg-[#F85149]/10 px-2 py-0.5 font-mono text-[10px] text-[#FF7B72]" title={held}>
              {held}
            </span>
          </div>
          <svg viewBox="0 0 100 24" className="h-6 min-w-0 flex-1" aria-hidden="true" preserveAspectRatio="none">
            <line
              x1="2"
              y1="12"
              x2="88"
              y2="12"
              stroke={sceneShown ? vc : "#30363D"}
              strokeWidth="3"
              strokeDasharray="7 6"
              strokeLinecap="round"
              className="fx-anim"
              style={{ animation: sceneShown && v.attackerIn ? "fx-dash .5s linear infinite" : "none", vectorEffect: "non-scaling-stroke" }}
            />
            {sceneShown && v.attackerIn && <polygon points="100,12 88,5 88,19" fill={vc} />}
            {sceneShown && !v.attackerIn && (
              <g stroke={GREEN} strokeWidth="3" strokeLinecap="round">
                <line x1="82" y1="4" x2="96" y2="20" />
                <line x1="96" y1="4" x2="82" y2="20" />
              </g>
            )}
          </svg>
          <div className="relative flex min-w-0 flex-col items-center gap-1">
            {sceneShown && v.attackerIn && (
              <span className="fx-anim absolute top-1 h-10 w-10 rounded-full border-2" style={{ borderColor: RED, animation: "fx-ping 1.1s ease-out 3" }} />
            )}
            <span
              className="fx-anim flex h-[34px] w-[34px] items-center justify-center rounded-lg border-2"
              style={{
                borderColor: sceneShown ? vc : "#30363D",
                backgroundColor: sceneShown ? vc + "22" : "#161B22",
                animation: sceneShown ? (v.attackerIn ? "fx-shake .6s both" : "fx-pop .5s both") : "none",
              }}
            >
              <LockIcon open={sceneShown && v.attackerIn} color={sceneShown ? vc : "#6E7681"} size={22} />
            </span>
            <span className="text-[10px] text-[#8B949E]">{v.vault ?? "Akun korban"}</span>
          </div>
        </div>
        <p
          key={`sv-${token}`}
          className="fx-anim mt-2 text-sm font-medium"
          style={{ color: vc, opacity: sceneShown ? 1 : 0, animation: sceneShown ? "fx-rise .5s both" : "none" }}
        >
          {v.attackerIn ? v.verdictBad ?? "Terautentikasi sebagai korban" : v.verdictGood ?? "Tidak berguna (tidak terautentikasi)"}
        </p>
      </div>
      <p className={`${CAPTION} ${FADE}`} style={{ opacity: sceneShown ? 1 : 0, color: bad ? SOFT_RED : GREEN }}>
        {result.reason}
      </p>
    </div>
  );
}

/* ---- compare: dua respons ditumpuk, yang berbeda berkedip ---- */

function CompareViz({ result, token, run }: VizProps) {
  const c = result.compare as Compare;
  const rows = c.rows;
  const n = useTicker(token, run, 800, rows.length + 2);
  const bad = result.outcome !== "neutralized";
  const diff = rows.map((r) => r.a !== r.b);
  const distinguishable = diff.some(Boolean);
  const stampShown = n >= rows.length;
  const capShown = n >= rows.length + 1;
  const vc = bad ? RED : GREEN;
  const stamp = distinguishable ? c.yes ?? "BISA DIBEDAKAN" : c.no ?? "TIDAK BISA DIBEDAKAN";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs">
        <span />
        <div className="rounded-lg border border-[#30363D] bg-[#0D1117] px-2 py-2 text-center">
          <div className="flex justify-center">
            <PersonIcon color={BLUE} kind="victim" size={26} />
          </div>
          <p className="mt-1 break-words font-medium text-[#E6EDF3]">{c.a}</p>
        </div>
        <div className="rounded-lg border border-[#30363D] bg-[#0D1117] px-2 py-2 text-center">
          <div className="flex justify-center">
            <PersonIcon color="#8B949E" kind="ghost" size={26} />
          </div>
          <p className="mt-1 break-words font-medium text-[#E6EDF3]">{c.b}</p>
        </div>

        {rows.map((r, i) => {
          const shown = n >= i;
          const differs = diff[i];
          const col = differs ? RED : GREEN;
          const cell = (txt: string, side: "a" | "b") => (
            <div
              className="fx-anim relative min-w-0 break-words rounded-md border px-2 py-1.5 font-mono"
              style={{
                opacity: shown ? 1 : 0,
                borderColor: shown ? col + "99" : "#21262D",
                backgroundColor: shown ? col + "14" : "#0D1117",
                color: differs ? SOFT_RED : "#C9D1D9",
                transform: shown ? "none" : side === "a" ? "translateX(-16px)" : "translateX(16px)",
                transition: "all .6s cubic-bezier(.2,.9,.2,1)",
                animation: shown && differs ? "fx-shake .55s .35s both" : "none",
              }}
            >
              {txt}
            </div>
          );
          return (
            <div key={i} className="contents">
              <div className="flex items-center justify-between gap-1 text-[#C9D1D9]">
                <span className="min-w-0 break-words">{r.label}</span>
                <span
                  className="fx-anim flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#0D1117]"
                  style={{
                    backgroundColor: col,
                    opacity: shown ? 1 : 0,
                    animation: shown ? "fx-pop .45s .3s both" : "none",
                  }}
                >
                  {differs ? "≠" : "="}
                </span>
              </div>
              {cell(r.a, "a")}
              {cell(r.b, "b")}
            </div>
          );
        })}
      </div>

      <div
        className="fx-anim flex items-center justify-center rounded-lg border-2 border-dashed px-3 py-4"
        style={{
          borderColor: stampShown ? vc : "#21262D",
          backgroundColor: stampShown ? vc + "10" : "#0D1117",
          animation: stampShown ? (bad ? "fx-glow-red 1.2s ease-in-out 3" : "fx-glow-green 1.2s ease-in-out 2") : "none",
        }}
      >
        <p
          key={`stamp-${token}`}
          className="fx-anim rounded border-2 px-3 py-1 text-center font-mono text-sm font-bold tracking-wide"
          style={{
            color: vc,
            borderColor: vc,
            opacity: stampShown ? 1 : 0,
            animation: stampShown ? "fx-slam .6s both" : "none",
          }}
        >
          {stamp}
        </p>
      </div>
      <p className={`${CAPTION} ${FADE}`} style={{ opacity: capShown ? 1 : 0, color: vc }}>
        {result.reason}
      </p>
    </div>
  );
}

/* ---- network: paket menembus (atau mental di) gerbang menuju layanan internal ---- */

const NET_TARGETS: Record<NetTarget, { x: number; y: number; name: string; sub: string }> = {
  public: { x: 318, y: 36, name: "Internet publik", sub: "CDN gambar" },
  redis: { x: 318, y: 124, name: "Redis", sub: "localhost" },
  metadata: { x: 318, y: 160, name: "Metadata", sub: "169.254.169.254" },
  admin: { x: 318, y: 196, name: "Panel admin", sub: "internal-admin.local" },
};

function NetworkViz({ result, token, run }: VizProps) {
  const w = result.network as Network;
  const n = useTicker(token, run, 900, 5);
  const bad = result.outcome !== "neutralized";
  const tgt = NET_TARGETS[w.target];
  const internal = w.target !== "public";
  const gateColor = w.gate.state === "closed" ? GREEN : w.gate.state === "none" ? "#6E7681" : AMBER;
  const reached = w.passed && n >= 3;
  const blocked = !w.passed && n >= 3;
  const hit = reached && internal;

  // posisi paket: 0 pengguna, 1 server, 2 gerbang, 3 tujuan (atau mental kembali ke gerbang)
  const pos = [
    { x: 32, y: 112 },
    { x: 132, y: 112 },
    { x: 214, y: 112 },
    w.passed ? { x: tgt.x - 62, y: tgt.y } : { x: 196, y: 112 },
  ][Math.min(n, 3)];
  const packetColor = hit ? RED : ACCENT;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#30363D] bg-[#0D1117] p-2">
        <svg viewBox="0 0 400 236" className="w-full" role="img" aria-label="Peta jaringan: pengguna, server aplikasi, internet publik, dan jaringan internal">
          {/* zona internal */}
          <rect
            x="252"
            y="82"
            width="140"
            height="146"
            rx="10"
            fill={hit ? "#F8514912" : "#161B22"}
            stroke={hit ? RED : "#484F58"}
            strokeWidth="1.5"
            strokeDasharray="6 5"
            style={{ transition: "all .6s" }}
          />
          <text x="322" y="96" textAnchor="middle" fill="#8B949E" fontSize="9">
            Jaringan internal
          </text>

          {/* jalur */}
          <line x1="52" y1="112" x2="104" y2="112" stroke="#30363D" strokeWidth="2" strokeDasharray="4 4" />
          <line x1="160" y1="112" x2="214" y2="112" stroke="#30363D" strokeWidth="2" strokeDasharray="4 4" />
          {w.passed && n >= 3 && (
            <line
              x1="214"
              y1="112"
              x2={tgt.x - 62}
              y2={tgt.y}
              stroke={hit ? RED : GREEN}
              strokeWidth="2.5"
              strokeDasharray="6 6"
              className="fx-anim"
              style={{ animation: "fx-dash .5s linear infinite" }}
            />
          )}

          {/* pengguna */}
          <g transform="translate(16,96)">
            <circle cx="16" cy="9" r="7" fill={ACCENT + "33"} stroke={ACCENT} strokeWidth="2" />
            <path d="M3 32c0-8 6-12 13-12s13 4 13 12" fill={ACCENT + "22"} stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
          </g>
          <text x="32" y="142" textAnchor="middle" fill="#C9D1D9" fontSize="9">
            Penyerang
          </text>

          {/* server */}
          <rect x="104" y="86" width="56" height="52" rx="8" fill="#161B22" stroke={BLUE} strokeWidth="2" />
          <rect x="112" y="95" width="40" height="9" rx="2" fill={BLUE + "33"} />
          <rect x="112" y="108" width="40" height="9" rx="2" fill={BLUE + "33"} />
          <circle cx="118" cy="99.5" r="1.5" fill={BLUE} />
          <circle cx="118" cy="112.5" r="1.5" fill={BLUE} />
          <text x="132" y="152" textAnchor="middle" fill="#C9D1D9" fontSize="9">
            Server aplikasi
          </text>

          {/* gerbang validasi */}
          <g>
            <line x1="214" y1="86" x2="214" y2="138" stroke={gateColor} strokeWidth={w.gate.state === "none" ? 2 : 5} strokeDasharray={w.gate.state === "none" ? "3 5" : "0"} strokeLinecap="round" opacity={w.gate.state === "open" ? 0.45 : 1} />
            {n >= 2 && w.gate.state === "closed" && !w.passed && (
              <circle className="fx-anim" cx="214" cy="112" r="14" fill="none" stroke={GREEN} strokeWidth="2" style={{ animation: "fx-ping .9s ease-out 2", transformOrigin: "214px 112px" }} />
            )}
            <text x="214" y="78" textAnchor="middle" fill={gateColor} fontSize="8.5" fontWeight="700">
              {w.gate.label}
            </text>
          </g>

          {/* tujuan */}
          {(Object.keys(NET_TARGETS) as NetTarget[]).map((k) => {
            const t = NET_TARGETS[k];
            const isT = k === w.target;
            const lit = isT && reached;
            const c = lit ? (internal ? RED : GREEN) : "#6E7681";
            return (
              <g key={k}>
                {lit && internal && (
                  <circle className="fx-anim" cx={t.x - 52} cy={t.y} r="12" fill="none" stroke={RED} strokeWidth="2" style={{ animation: "fx-ping 1s ease-out 3", transformOrigin: `${t.x - 52}px ${t.y}px` }} />
                )}
                <rect x={t.x - 52} y={t.y - 13} width="104" height="26" rx="6" fill={lit ? c + "22" : "#161B22"} stroke={c} strokeWidth={lit ? 2.2 : 1.2} style={{ transition: "all .5s" }} />
                <text x={t.x - 38} y={t.y - 1} fill={lit ? c : "#C9D1D9"} fontSize="9" fontWeight="700">
                  {t.name}
                </text>
                <text x={t.x - 38} y={t.y + 9} fill="#8B949E" fontSize="7.5">
                  {t.sub}
                </text>
              </g>
            );
          })}

          {/* paket */}
          <g style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, transition: "transform .8s cubic-bezier(.45,0,.2,1)" }}>
            <circle r="7" fill={packetColor} style={{ filter: `drop-shadow(0 0 6px ${packetColor})` }} />
            <circle r="3" fill="#0D1117" />
          </g>
          {blocked && (
            <g className="fx-anim" style={{ animation: "fx-pop .5s both", transformOrigin: "214px 112px" }}>
              <circle cx="214" cy="112" r="12" fill="#0D1117" stroke={GREEN} strokeWidth="2.5" />
              <path d="M208 112l4 4 8-8" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" />
            </g>
          )}
        </svg>
      </div>

      <div className="rounded-md border border-[#30363D] bg-[#0D1117] px-3 py-2">
        <p className={SMALL}>URL yang dikirim pengguna</p>
        <p className="break-all font-mono text-xs text-[#E6EDF3]">{w.url}</p>
        {w.gate.note && <p className="mt-1 text-xs" style={{ color: gateColor }}>{w.gate.label}: {w.gate.note}</p>}
      </div>

      {w.leaked && w.leaked.length > 0 && (
        <div className="space-y-1">
          {w.leaked.map((ln, i) => (
            <p
              key={i}
              className="fx-anim rounded border border-[#F85149]/60 bg-[#F85149]/12 px-2 py-1 font-mono text-xs text-[#FF7B72]"
              style={{ opacity: n >= 4 ? 1 : 0, animation: n >= 4 ? `fx-rise .5s ${i * 0.15}s both` : "none" }}
            >
              {ln}
            </p>
          ))}
        </div>
      )}
      <p className={`${CAPTION} ${FADE}`} style={{ opacity: n >= 4 ? 1 : 0, color: bad ? SOFT_RED : GREEN }}>
        {result.reason}
      </p>
    </div>
  );
}

function VizPanel(props: VizProps & { onReplay: () => void; L: Required<Labels> }) {
  const { payload, result, L, onReplay } = props;
  let body;
  if (!props.result) {
    body = <p className="text-sm text-[#8B949E]">Hasil untuk skenario ini belum tersedia di implementasi ini.</p>;
  } else if (result.decision) body = <DecisionViz {...props} />;
  else if (result.ledger) body = <LedgerViz {...props} />;
  else if (result.response) body = <ResponseViz {...props} />;
  else if (result.health) body = <HealthViz {...props} />;
  else if (result.exposure) body = <ExposureViz {...props} />;
  else if (result.session) body = <SessionViz {...props} />;
  else if (result.compare) body = <CompareViz {...props} />;
  else if (result.network) body = <NetworkViz {...props} />;
  else body = <p className="text-sm text-[#C9D1D9]">{result.reason}</p>;

  return (
    <div className="flex h-full flex-col rounded-lg border border-[#21262D] bg-[#161B22]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#21262D] px-4 py-2.5 text-xs text-[#8B949E]">
        <span className="font-medium text-[#E6EDF3]">{L.vizTitle}</span>
        <span className="rounded bg-[#F85149]/15 px-1.5 py-0.5 font-mono text-[#F85149]">{payload.id.toUpperCase()}</span>
        <span className="flex-1">{L.vizHint}</span>
        <button
          type="button"
          onClick={onReplay}
          className="rounded border border-[#21262D] px-3 py-2 text-xs text-[#8B949E] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
        >
          Putar ulang
        </button>
      </div>
      <div key={props.token} className="flex flex-1 flex-col p-4">
        {body}
        <p className="mt-4 text-[11px] leading-relaxed text-[#8B949E]">{L.disclaimer}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main renderer                                                       */
/* ------------------------------------------------------------------ */

export default function FaultSimulation({ config }: { config: FaultConfig }) {
  const { payloads, variants } = config;
  const L: Required<Labels> = { ...DEFAULT_LABELS, ...(config.labels ?? {}) };

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
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const tag = TAG[variant.tag] ?? TAG.weak;

  const autoFocusId =
    payloads.find((p) => {
      const r = variant.results[p.id];
      return r && r.outcome !== "neutralized";
    })?.id ?? payloads[0].id;
  const focusId = pinnedId && payloads.some((p) => p.id === pinnedId) ? pinnedId : autoFocusId;
  const focusPayload = payloads.find((p) => p.id === focusId) ?? payloads[0];
  const focusResult = variant.results[focusPayload.id];

  const asmToken = `${variant.id}:${focusId}:${runKey}`;
  const assembled = useArrived(asmToken, seen);

  const known = payloads.filter((p) => variant.results[p.id]);
  const through = known.filter((p) => variant.results[p.id]?.outcome !== "neutralized").length;
  const scoreColor = through === 0 ? GREEN : through === known.length ? RED : AMBER;
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

  const matrixCols = { gridTemplateColumns: `1fr repeat(${payloads.length}, 2rem)` };
  const navBtn =
    "rounded-md border px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      aria-label="Simulasi interaktif"
      className="my-10 space-y-6 lg:relative lg:left-1/2 lg:w-[min(68rem,calc(100vw_-_4rem))] lg:-translate-x-1/2"
    >
      <style>{FX_CSS}</style>
      {/* Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-[#E6EDF3]">
            Pilih implementasi, lalu lihat apa yang terjadi saat ada yang gagal
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

      {/* Code (left) | visualization (right) */}
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
                  l.changed ? "border-[#F0883E] bg-[#F0883E]/10 text-[#E6EDF3]" : "border-transparent text-[#C9D1D9]"
                }`}
              >
                {l.text === "" ? " " : l.text}
              </div>
            ))}
          </div>
        </div>

        <div ref={animRef} className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          {focusResult ? (
            <VizPanel
              payload={focusPayload}
              result={focusResult}
              token={asmToken}
              run={assembled}
              L={L}
              onReplay={() => setRunKey((k) => k + 1)}
            />
          ) : (
            <div className="rounded-lg border border-[#21262D] bg-[#161B22] p-4 text-sm text-[#8B949E]">
              Hasil untuk skenario ini belum tersedia di implementasi ini.
            </div>
          )}
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

        {/* Scenario list */}
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
                    <span className="min-w-0 flex-1 break-words text-sm text-[#F0883E]">{p.raw}</span>
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