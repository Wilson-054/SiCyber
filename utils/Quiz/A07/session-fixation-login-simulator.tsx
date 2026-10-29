// Save as: utils/Quiz/A07/lab2/session-fixation-login-simulator.tsx
"use client";

import { useMemo, useState } from "react";
import { attemptSessionFixationLogin } from "./session-fixation-login-attempts";
import type {
  CookieEntry,
  SessionFixationLoginCriteria,
  SessionFixationLoginFailureReason,
} from "./session-fixation-login-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<SessionFixationLoginFailureReason, string> = {
  no_cookie_captured: "Klik salah satu cookie di jar penyerang untuk menandainya sebagai ID sesi yang kamu catat.",
  wrong_cookie_captured:
    "Cookie yang kamu catat itu bukan cookie sesi. Pikirkan cookie mana yang dipakai server untuk mengenali siapa kamu di setiap request — bukan yang menyimpan preferensi atau isi keranjang.",
  no_link_entered: "Kolom link masih kosong.",
  link_missing_param: "Link yang kamu susun belum memuat parameter session ID. Coba tambahkan di bagian query string (setelah tanda ?).",
  link_wrong_value:
    "Nilai parameter di link tidak sama dengan nilai cookie yang kamu catat di Langkah 1. Pastikan kamu menyalin nilainya persis.",
  no_victim_cookie_selected: "Klik salah satu cookie di jar korban untuk dipakai mengakses akunnya.",
  wrong_cookie_reused: "Cookie yang kamu pilih di sisi korban bukan cookie sesi. Cek lagi nama cookie yang sama dengan Langkah 1.",
  session_id_mismatch: "Nilainya tidak cocok dengan ID sesi yang sebenarnya tertanam. Ulangi dari Langkah 1 dan pastikan setiap nilai tersalin konsisten.",
};

function CookieJar({
  cookies,
  selectedName,
  onSelect,
}: {
  cookies: CookieEntry[];
  selectedName: string | null;
  onSelect: (c: CookieEntry) => void;
}) {
  return (
    <div className="space-y-1.5">
      {cookies.map((c) => (
        <button
          key={c.name}
          onClick={() => onSelect(c)}
          className={`block w-full rounded border px-3 py-1.5 text-left font-mono text-xs transition ${
            selectedName === c.name
              ? "border-[#F0883E] bg-[#F0883E]/10 text-[#F0883E]"
              : "border-[#21262D] text-[#8B949E] hover:border-[#21262D] hover:bg-[#21262D]/40"
          }`}
        >
          {c.name}=<span className="text-[#E6EDF3]">{c.value}</span>
        </button>
      ))}
    </div>
  );
}

function BrowserChrome({
  label,
  urlBar,
  children,
}: {
  label: string;
  urlBar: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-[#21262D]">
      <div className="flex items-center gap-2 border-b border-[#21262D] bg-[#21262D] px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-[#F85149]" />
        <span className="h-2 w-2 rounded-full bg-[#F0883E]" />
        <span className="h-2 w-2 rounded-full bg-[#3FB950]" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-[#8B949E]">{label}</span>
        <div className="ml-auto truncate rounded bg-[#0D1117] px-2 py-0.5 font-mono text-[10px] text-[#8B949E]">
          {urlBar}
        </div>
      </div>
      <div className="bg-[#0D1117] p-3">{children}</div>
    </div>
  );
}

export default function SessionFixationLoginSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: SessionFixationLoginCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  // Susunan cookie jar deterministik (bukan acak) supaya tidak ada masalah
  // hydration SSR/CSR — cookie sesi disisipkan di tengah daftar pengecoh,
  // bukan selalu di posisi pertama.
  const anonymousCookies = useMemo<CookieEntry[]>(() => {
    const list = [...criteria.decoy_cookies];
    list.splice(Math.floor(list.length / 2), 0, {
      name: criteria.session_cookie_name,
      value: criteria.anonymous_session_id,
    });
    return list;
  }, [criteria.decoy_cookies, criteria.session_cookie_name, criteria.anonymous_session_id]);

  const [captured, setCaptured] = useState(false);
  const [capturedCookie, setCapturedCookie] = useState<CookieEntry | null>(null);

  const [plantedLinkInput, setPlantedLinkInput] = useState("");
  const [planted, setPlanted] = useState(false);

  const [victimLoggedIn, setVictimLoggedIn] = useState(false);
  const [finalCookie, setFinalCookie] = useState<CookieEntry | null>(null);

  const [lastResult, setLastResult] = useState<Awaited<
    ReturnType<typeof attemptSessionFixationLogin>
  > | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Nilai yang "ditanamkan" ke jar korban dibaca dari link yang peserta
  // ketik sendiri (bukan otomatis dari capturedCookie) — kalau linknya
  // salah tulis, jar korban ikut membawa nilai yang salah itu, persis
  // seperti server yang menerima apa saja dari parameter URL.
  const plantedValue = useMemo(() => {
    if (!planted) return null;
    const regex = new RegExp(`[?&]${criteria.session_url_param}=([^&#]*)`, "i");
    const match = plantedLinkInput.match(regex);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }, [planted, plantedLinkInput, criteria.session_url_param]);

  const victimCookies = useMemo<CookieEntry[]>(() => {
    const list = [...criteria.decoy_cookies];
    list.splice(Math.floor(list.length / 2), 0, {
      name: criteria.session_cookie_name,
      value: plantedValue ?? "(tidak ditemukan)",
    });
    return list;
  }, [criteria.decoy_cookies, criteria.session_cookie_name, plantedValue]);

  const plant = () => {
    if (!plantedLinkInput.trim()) return;
    setPlanted(true);
  };

  const victimLogin = () => setVictimLoggedIn(true);

  const submit = async () => {
    if (!capturedCookie || !finalCookie) return;
    setIsPending(true);
    try {
      const result = await attemptSessionFixationLogin(categoryId, exerciseId, criteria, {
        capturedCookieName: capturedCookie.name,
        capturedCookieValue: capturedCookie.value,
        plantedLinkInput,
        finalCookieName: finalCookie.name,
        finalCookieValue: finalCookie.value,
      });
      setLastResult(result);
      if (result.counters) {
        onCountersUpdate(result.counters);
        if (result.counters.reconsiderPrompt) onReconsiderPrompt();
      }
    } finally {
      setIsPending(false);
    }
  };

  const activeFeedback = lastResult
    ? feedbackByOutcome[lastResult.success ? "success" : "failure"]
    : null;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name}</h3>
      <p className="mb-5 text-xs leading-relaxed text-[#8B949E]">{criteria.feature_context}</p>

      <div className="space-y-5">
        {/* Langkah 1 */}
        <div>
          <p className="mb-2 text-xs font-medium text-[#E6EDF3]">
            Langkah 1 — Buka aplikasi sebagai pengunjung anonim, lalu catat cookie yang menyimpan ID sesi
          </p>
          <BrowserChrome label="Browser Penyerang (kamu)" urlBar={`${criteria.app_name.toLowerCase()}.example/`}>
            {!captured ? (
              <button
                onClick={() => setCaptured(true)}
                className="rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F0883E]/50"
              >
                Buka aplikasi
              </button>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-[#8B949E]">Cookie yang diset browser:</p>
                <CookieJar cookies={anonymousCookies} selectedName={capturedCookie?.name ?? null} onSelect={setCapturedCookie} />
              </>
            )}
          </BrowserChrome>
        </div>

        {/* Langkah 2 */}
        {capturedCookie && (
          <div>
            <p className="mb-2 text-xs font-medium text-[#E6EDF3]">
              Langkah 2 — Susun link yang menanamkan ID itu ke browser korban lewat parameter URL
            </p>
            <p className="mb-2 font-mono text-[11px] text-[#8B949E]">
              Contoh bentuk: {criteria.app_name.toLowerCase()}.example{criteria.login_url_path}?
              {criteria.session_url_param}=…
            </p>
            <div className="flex gap-2">
              <input
                value={plantedLinkInput}
                onChange={(e) => setPlantedLinkInput(e.target.value)}
                placeholder={`https://${criteria.app_name.toLowerCase()}.example${criteria.login_url_path}?${criteria.session_url_param}=...`}
                disabled={planted}
                spellCheck={false}
                className="flex-1 rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 font-mono text-xs text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none disabled:opacity-60"
              />
              <button
                onClick={plant}
                disabled={planted || !plantedLinkInput.trim()}
                className="rounded bg-[#F0883E] px-3 py-2 text-xs font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
              >
                Kirim ke Korban
              </button>
            </div>
          </div>
        )}

        {/* Langkah 3 */}
        {planted && (
          <div>
            <p className="mb-2 text-xs font-medium text-[#E6EDF3]">Langkah 3 — Korban membuka tautan lalu login</p>
            <BrowserChrome
              label={`Browser Korban (${criteria.victim.username})`}
              urlBar={`${criteria.app_name.toLowerCase()}.example${criteria.login_url_path}`}
            >
              {!victimLoggedIn ? (
                <button
                  onClick={victimLogin}
                  className="rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F0883E]/50"
                >
                  Korban login
                </button>
              ) : (
                <p className="font-mono text-xs text-[#3FB950]">Login berhasil sebagai {criteria.victim.username}.</p>
              )}
            </BrowserChrome>
          </div>
        )}

        {/* Langkah 4 */}
        {victimLoggedIn && (
          <div>
            <p className="mb-2 text-xs font-medium text-[#E6EDF3]">
              Langkah 4 — Kembali ke browser penyerang, pilih cookie yang sama untuk membuka akun korban
            </p>
            <p className="mb-2 text-[11px] text-[#8B949E]">Cookie di jar korban setelah login:</p>
            <CookieJar cookies={victimCookies} selectedName={finalCookie?.name ?? null} onSelect={setFinalCookie} />
            <button
              onClick={submit}
              disabled={isPending || !finalCookie}
              className="mt-3 rounded bg-[#F0883E] px-3 py-2 text-xs font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
            >
              {isPending ? "Mencoba…" : "Buka Profil Korban dengan Cookie Ini"}
            </button>
          </div>
        )}
      </div>

      {lastResult && (
        <div
          className={`mt-5 rounded-md border px-4 py-3 text-sm ${
            lastResult.success
              ? "border-[#238636]/40 bg-[#238636]/10 text-[#3FB950]"
              : "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]"
          }`}
        >
          <p className="font-medium">
            {activeFeedback?.notification_message ?? (lastResult.success ? "Berhasil." : "Belum berhasil.")}
          </p>
          <p className="mt-2 text-[#C9D1D9]">{activeFeedback?.explanation}</p>

          {!lastResult.success && lastResult.reason !== "ok" && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {FAILURE_HINTS[lastResult.reason]}
            </div>
          )}

          {lastResult.success && lastResult.leakedProfile && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 font-mono text-xs text-[#8B949E]">
              <p>
                <span className="text-[#F0883E]">nama</span>: {lastResult.leakedProfile.display_name}
              </p>
              {Object.entries(lastResult.leakedProfile.fields).map(([k, v]) => (
                <p key={k}>
                  <span className="text-[#F0883E]">{k}</span>: {v}
                </p>
              ))}
            </div>
          )}

          {lastResult.success && activeFeedback?.implementation_notes && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {activeFeedback.implementation_notes}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}