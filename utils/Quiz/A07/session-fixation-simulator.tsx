// Save as: utils/Quiz/A07/lab1/session-fixation-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import {
  attemptSessionFixationHijack,
  simulateVictimLogin,
} from "@/../utils/Quiz/A07/session-fixation-attempts";
import type {
  SessionFixationCriteria,
  SessionFixationConclusion,
  SessionFixationFailureReason,
} from "@/../utils/Quiz/A07/session-fixation-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

const FAILURE_HINTS: Record<SessionFixationFailureReason, string> = {
  session_not_set_before_login:
    "Kamu belum menetapkan session ID apapun di cookie-mu. Isi dan set dulu sebelum lanjut.",
  victim_not_logged_in_yet:
    "Korban belum disimulasikan login. Klik 'Simulasikan Korban Login' dulu.",
  no_conclusion_made:
    "Kamu belum memilih kesimpulan. Bandingkan cookie korban dengan cookie yang kamu set, lalu pilih salah satu.",
  wrong_conclusion_same:
    "Kesimpulanmu keliru: cookie korban ternyata SAMA PERSIS dengan yang kamu tanam. Artinya serangan ini sebenarnya masih bisa jalan — coba cek ulang, jangan menyerah dulu.",
  wrong_conclusion_different:
    "Kesimpulanmu keliru: cookie korban ternyata BERBEDA dari yang kamu tanam. Cek lagi nilainya sebelum menyimpulkan 'sama'.",
  check_session_mismatch:
    "Kesimpulanmu sudah benar, tapi cookie yang kamu pakai saat mengecek akses sekarang berbeda dari cookie korban. Pastikan cookie di browsermu masih sama seperti yang kamu tanam di awal.",
};

export default function SessionFixationSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: SessionFixationCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [attackerSessionIdSet, setAttackerSessionIdSet] = useState<string>("");
  const [victimLoggedIn, setVictimLoggedIn] = useState(false);
  const [victimSessionIdAfterLogin, setVictimSessionIdAfterLogin] = useState<string>("");
  const [conclusion, setConclusion] = useState<SessionFixationConclusion | null>(null);
  const [checkSessionIdInput, setCheckSessionIdInput] = useState<string>("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptSessionFixationHijack>> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingLogin, startLoginTransition] = useTransition();

  const setCookie = () => {
    if (!sessionIdInput.trim()) return;
    setAttackerSessionIdSet(sessionIdInput.trim());
    // reset langkah-langkah setelahnya karena cookie baru berarti alur diulang
    setVictimLoggedIn(false);
    setVictimSessionIdAfterLogin("");
    setConclusion(null);
    setLastResult(null);
  };

  const doSimulateLogin = () => {
    startLoginTransition(async () => {
      const { victimSessionIdAfterLogin } = await simulateVictimLogin(criteria, attackerSessionIdSet);
      setVictimSessionIdAfterLogin(victimSessionIdAfterLogin);
      setVictimLoggedIn(true);
      setConclusion(null);
      setCheckSessionIdInput(attackerSessionIdSet); // default: cookie browser attacker tidak berubah sendiri
    });
  };

  const submit = () => {
    startTransition(async () => {
      const result = await attemptSessionFixationHijack(categoryId, exerciseId, criteria, {
        attackerSessionIdSet,
        victimLoggedIn,
        victimSessionIdAfterLogin,
        userConclusion: conclusion,
        attackerCheckSessionId: checkSessionIdInput.trim(),
      });
      setLastResult(result);
      if (result.counters) {
        onCountersUpdate(result.counters);
        if (result.counters.reconsiderPrompt) onReconsiderPrompt();
      }
    });
  };

  const activeFeedback = lastResult
    ? feedbackByOutcome[lastResult.success ? "success" : "failure"]
    : null;

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi — bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">
        {criteria.app_name} · alur login {criteria.victim_username}
      </h3>
      <p className="mb-4 text-xs text-[#8B949E]">
        Kamu berperan sebagai penyerang. Tentukan sendiri session ID yang mau kamu tanam, simulasikan korban
        login, lalu amati dan simpulkan sendiri sebelum mencoba akses.
      </p>

      <div className="space-y-4">
        {/* Langkah 1 */}
        <div className="rounded border border-[#21262D] bg-[#0D1117] p-4">
          <p className="mb-2 font-mono text-xs text-[#F0883E]">Langkah 1 — Tentukan & set session ID di browsermu</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              className="flex-1 rounded border border-[#21262D] bg-[#161B22] px-3 py-2 font-mono text-xs text-[#C9D1D9]"
              placeholder="Ketik session ID pilihanmu sendiri, bebas..."
            />
            <button
              onClick={setCookie}
              disabled={!sessionIdInput.trim()}
              className="rounded bg-[#21262D] px-3 py-2 text-xs text-[#E6EDF3] hover:bg-[#30363D] disabled:opacity-50"
            >
              Set Cookie
            </button>
          </div>
          {attackerSessionIdSet && (
            <p className="mt-2 font-mono text-xs text-[#3FB950]">
              Cookie session di browsermu sekarang: "{attackerSessionIdSet}"
            </p>
          )}
        </div>

        {/* Langkah 2 */}
        <div className="rounded border border-[#21262D] bg-[#0D1117] p-4">
          <p className="mb-2 font-mono text-xs text-[#F0883E]">Langkah 2 — Simulasikan korban login</p>
          <p className="mb-2 text-xs text-[#8B949E]">
            Anggap tautan berisi session ID di atas sudah kamu kirim ke {criteria.victim_username}, dan dia login.
          </p>
          <button
            onClick={doSimulateLogin}
            disabled={isLoadingLogin}
            className="rounded bg-[#21262D] px-3 py-2 text-xs text-[#E6EDF3] hover:bg-[#30363D] disabled:opacity-50"
          >
            {isLoadingLogin ? "Memproses…" : "Simulasikan Korban Login"}
          </button>
          {victimLoggedIn && (
            <p className="mt-2 font-mono text-xs text-[#C9D1D9]">
              Cookie session {criteria.victim_username} setelah login: "{victimSessionIdAfterLogin}"
            </p>
          )}
        </div>

        {/* Langkah 3 - observasi & kesimpulan */}
        <div className="rounded border border-[#21262D] bg-[#0D1117] p-4">
          <p className="mb-2 font-mono text-xs text-[#F0883E]">Langkah 3 — Bandingkan & simpulkan</p>
          <p className="mb-3 text-xs text-[#8B949E]">
            Bandingkan cookie session {criteria.victim_username} di atas dengan cookie yang kamu set di Langkah 1.
            Apakah sama persis?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConclusion("same")}
              className={`rounded border px-3 py-2 text-xs ${
                conclusion === "same"
                  ? "border-[#3FB950] bg-[#238636]/20 text-[#3FB950]"
                  : "border-[#21262D] text-[#C9D1D9] hover:bg-[#161B22]"
              }`}
            >
              Sama — saya coba akses
            </button>
            <button
              onClick={() => setConclusion("different")}
              className={`rounded border px-3 py-2 text-xs ${
                conclusion === "different"
                  ? "border-[#F85149] bg-[#F85149]/20 text-[#F85149]"
                  : "border-[#21262D] text-[#C9D1D9] hover:bg-[#161B22]"
              }`}
            >
              Beda — serangan gagal
            </button>
          </div>
        </div>

        {/* Langkah 4 - cek akses, hanya relevan kalau kesimpulan "same" */}
        {conclusion === "same" && (
          <div className="rounded border border-[#21262D] bg-[#0D1117] p-4">
            <p className="mb-2 font-mono text-xs text-[#F0883E]">Langkah 4 — Cek akses dengan cookie di browsermu</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={checkSessionIdInput}
                onChange={(e) => setCheckSessionIdInput(e.target.value)}
                className="flex-1 rounded border border-[#21262D] bg-[#161B22] px-3 py-2 font-mono text-xs text-[#C9D1D9]"
                placeholder="Cookie yang dipakai saat refresh..."
              />
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={isPending || !conclusion}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Memeriksa…" : "Kirim Jawaban"}
        </button>
      </div>

      {lastResult && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            lastResult.success
              ? "border-[#238636]/40 bg-[#238636]/10 text-[#3FB950]"
              : "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]"
          }`}
        >
          <p className="font-medium">
            {activeFeedback?.notification_message ?? (lastResult.success ? "Berhasil." : "Belum tepat.")}
          </p>
          <p className="mt-2 text-[#C9D1D9]">{activeFeedback?.explanation}</p>

          {!lastResult.success && lastResult.reason !== "ok" && (
            <div className="mt-3 rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {FAILURE_HINTS[lastResult.reason]}
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