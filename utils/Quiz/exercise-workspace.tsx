// Save as: utils/Quiz/exercise-workspace.tsx (replaces existing file)
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HintPanel from "@/../utils/Quiz/hint-panel";
import SqliLoginSimulator from "./A05/Sql/sqli-login-simulator";
import IdorProfileSimulator from "./A01/lab1/idor-profile-simulator";
import CsrfTransferSimulator from "./A01/lab2/CRSF-simulator-simulator";
import SearchUnionSimulator from "@/../utils/Quiz/search-union-simulator";
import NumericIdSimulator from "@/../utils/Quiz/numeric-id-simulator";
import ReconsiderPrompt from "@/../utils/Quiz/ReconsiderPrompt";
import type { SqliCriteria } from "./A05/Sql/sqli-evaluator"
import SessionFixationSimulator from "./A07/session-fixation-simulator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";
import DockerSocketSimulator from "@/../utils/Quiz/docker-socket-simulator";
import XxeSimulator from "@/../utils/Quiz/xxe-simulator";
import CloudStorageSimulator from "@/../utils/Quiz/cloud-storage-simulator";
import DockerEscapeSimulator from "@/../utils/Quiz/docker-escape-simulator";
import XxeBlindSimulator from "@/../utils/Quiz/xxe-blind-simulator";
import RaceConditionLab from "./A10/race-condition-lab";
import MisconfigDebugSimulator from "@/../utils/Quiz/misconfig-debug-simulator";
import AuthTokenSimulator from "@/../utils/Quiz/auth-token-simulator";
import type { ExerciseCriteria } from "@/../utils/Quiz/types";
import ErrorDebugExposureSimulator from "@/../utils/Quiz/A10/error-debug-exposure-simulator";
import WeakHashSimulator from "@/../utils/Quiz/weak-hash-simulator";
import PriceTamperSimulator from "@/../utils/Quiz/price-tamper-simulator";
import StoredXssSimulator from "./A05/xss/xss-simulator";
import CookieTheftSimulator from "./A02/cookie-theft-simulator";
import { getNextRecommendedCategoryAction } from "@/app/materi/actions";
import NextCategoryPrompt from "@/app/components/Materi/NextCategoryPrompt";

type Hint = { id: string; hint_order: number; content: string };
type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};
type RecommendedCategory = { id: string; code: string; name: string } | null;

const REDIRECT_DELAY_SECONDS = 15;

export default function ExerciseWorkspace({
  categoryId,
  categoryCode,
  exerciseId,
  hints,
  scenarioConfig,
  criteria,
  feedbackByOutcome,
  initialCounters,
  isLastExercise,
}: {
  categoryId: string;
  categoryCode: string;
  exerciseId: string;
  hints: Hint[];
  scenarioConfig: { app_name?: string; login_label?: string };
  criteria: ExerciseCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  initialCounters: { hints_used: number; attempts_count: number; consecutive_failures: number; exercise_status: string };
  isLastExercise: boolean;
}) {
  const router = useRouter();
  const [counters, setCounters] = useState(initialCounters);
  const [showReconsider, setShowReconsider] = useState(false);
  const [redirectSecondsLeft, setRedirectSecondsLeft] = useState<number | null>(null);
  const [showCategoryPrompt, setShowCategoryPrompt] = useState(false);
  const [recommendedCategory, setRecommendedCategory] = useState<RecommendedCategory>(null);

  const handleCountersUpdate = (c: ProgressCounters) => {
    const justCompleted = c.exercise_status === "completed" && counters.exercise_status !== "completed";
    setCounters((prev) => ({ ...prev, ...c }));

    if (!justCompleted) return;

    if (isLastExercise) {
      // Exercise terakhir di kategori ini: jangan auto-redirect, tampilkan
      // rekomendasi kategori berikutnya. Fetch dilakukan di sini (bukan di
      // effect) supaya hanya terjadi tepat saat status baru saja completed.
      setShowReconsider(false);
      getNextRecommendedCategoryAction(categoryId).then((rec) => {
        setRecommendedCategory(rec);
        setShowCategoryPrompt(true);
      });
    } else {
      setShowReconsider(false);
      setRedirectSecondsLeft(REDIRECT_DELAY_SECONDS);
    }
  };

  useEffect(() => {
    if (redirectSecondsLeft === null) return;
    if (redirectSecondsLeft <= 0) {
      router.push(`/materi/${categoryCode}`);
      return;
    }
    const timer = setTimeout(() => setRedirectSecondsLeft((s) => (s ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [redirectSecondsLeft, router, categoryCode]);

  const simulatorProps = {
    categoryId,
    exerciseId,
    scenarioConfig,
    feedbackByOutcome,
    onCountersUpdate: handleCountersUpdate,
    onReconsiderPrompt: () => setShowReconsider(true),
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-4 font-mono text-xs text-[#8B949E]">
        <span>Percobaan: {counters.attempts_count}</span>
        <span>Hint dipakai: {counters.hints_used}</span>
        <span>Gagal berturut-turut: {counters.consecutive_failures}</span>
        <span className="text-[#F0883E]">Status: {counters.exercise_status}</span>
      </div>

      {redirectSecondsLeft !== null && (
        <div className="mb-6 flex items-center justify-between rounded-md border border-[#238636]/40 bg-[#238636]/10 px-5 py-4 text-sm text-[#3FB950]">
          <span>
            Latihan selesai! Mengarahkan kembali ke daftar materi dalam {redirectSecondsLeft} detik...
          </span>
          <button
            onClick={() => setRedirectSecondsLeft(null)}
            className="rounded border border-[#238636]/40 px-3 py-1 text-xs hover:bg-[#238636]/20"
          >
            Batalkan
          </button>
        </div>
      )}

      {showReconsider && <ReconsiderPrompt categoryCode={categoryCode} onDismiss={() => setShowReconsider(false)} />}

      {showCategoryPrompt && (
        <NextCategoryPrompt
          recommended={recommendedCategory}
          onClose={() => setShowCategoryPrompt(false)}
        />
      )}

      <HintPanel
        hints={hints}
        categoryId={categoryId}
        exerciseId={exerciseId}
        initialHintsUsed={initialCounters.hints_used}
        onCountersUpdate={(c: ProgressCounters) => {
          setCounters((prev) => ({ ...prev, ...c }));
          if (c.reconsiderPrompt) setShowReconsider(true);
        }}
      />

      {criteria.type === "sqli_login_bypass" && <SqliLoginSimulator {...simulatorProps} criteria={criteria} />}
      {criteria.type === "sqli_search_union" && <SearchUnionSimulator {...simulatorProps} criteria={criteria} />}
      {criteria.type === "sqli_id_filter" && <NumericIdSimulator {...simulatorProps} criteria={criteria} />}
      {criteria.type === "misconfig_debug_endpoint" && <MisconfigDebugSimulator {...simulatorProps} criteria={criteria} />}
      {criteria.type === "auth_predictable_session" && <AuthTokenSimulator {...simulatorProps} criteria={criteria} />}
      {criteria.type === "crypto_weak_hash_crack" && <WeakHashSimulator {...simulatorProps} criteria={criteria} />}
      {criteria.type === "insecure_design_price_tamper" && <PriceTamperSimulator {...simulatorProps} criteria={criteria} />}
      {criteria.type === "race_condition_lab" && (
        <RaceConditionLab categoryId={categoryId} exerciseId={exerciseId} criteria={criteria} />
      )}
      {criteria.type === "misconfig_docker_socket_exposed" && (
        <DockerSocketSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "xxe_file_read" && (
        <XxeSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "misconfig_open_bucket" && (
        <CloudStorageSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "misconfig_docker_container_escape" && (
        <DockerEscapeSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "xxe_blind_exfil" && (
        <XxeBlindSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "error_debug_exposure" && (
        <ErrorDebugExposureSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "session_fixation_hijack" && (
        <SessionFixationSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "stored_xss_comment_injection" && (
        <StoredXssSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "cookie_theft_via_missing_httponly" && (
        <CookieTheftSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "idor_profile_access" && (
        <IdorProfileSimulator {...simulatorProps} criteria={criteria} />
      )}
      {criteria.type === "csrf_fund_transfer" && (
        <CsrfTransferSimulator {...simulatorProps} criteria={criteria} />
      )}
    </div>
  );
}