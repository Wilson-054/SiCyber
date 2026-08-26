// Save as: utils/Quiz/cloud-storage-simulator.tsx
"use client";

import { useState, useTransition } from "react";
import { attemptOpenBucketAccess } from "@/../utils/Quiz/cloud-storage-attempts";
import type { MisconfigOpenBucketCriteria } from "@/../utils/Quiz/cloud-storage-evaluator";
import type { ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Feedback = {
  outcome: "success" | "failure";
  notification_message: string;
  explanation: string;
  implementation_notes: string | null;
};

export default function CloudStorageSimulator({
  categoryId,
  exerciseId,
  criteria,
  feedbackByOutcome,
  onCountersUpdate,
  onReconsiderPrompt,
}: {
  categoryId: string;
  exerciseId: string;
  criteria: MisconfigOpenBucketCriteria;
  feedbackByOutcome: Record<"success" | "failure", Feedback | undefined>;
  onCountersUpdate: (c: ProgressCounters) => void;
  onReconsiderPrompt: () => void;
}) {
  const [bucket, setBucket] = useState("");
  const [lastResult, setLastResult] = useState<Awaited<ReturnType<typeof attemptOpenBucketAccess>> | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await attemptOpenBucketAccess(categoryId, exerciseId, criteria, bucket);
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
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-[#8B949E]">Simulasi - bukan sistem nyata</p>
      <h3 className="mb-4 text-lg font-medium text-[#E6EDF3]">{criteria.app_name} - Cari Cloud Storage Bucket</h3>
      <p className="mb-3 text-xs text-[#8B949E]">
        Tim engineering {criteria.app_name} diketahui memakai pola penamaan bucket yang cukup mudah ditebak.
        Coba tebak nama bucket-nya:{" "}
        <code className="text-[#F0883E]">https://storage.example.com/{"{bucket}"}</code>
      </p>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          autoComplete="off"
          placeholder="nama-bucket"
          className="flex-1 rounded border border-[#21262D] bg-[#0D1117] px-3 py-2 text-sm text-[#E6EDF3] focus:border-[#F0883E]/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-[#F0883E] px-4 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-50"
        >
          {isPending ? "Memuat..." : "Coba Akses"}
        </button>
      </form>

      {lastResult && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            lastResult.success
              ? "border-[#238636]/40 bg-[#238636]/10 text-[#3FB950]"
              : "border-[#F85149]/40 bg-[#F85149]/10 text-[#F85149]"
          }`}
        >
          <p className="font-medium">
            {activeFeedback?.notification_message ?? (lastResult.success ? "Berhasil." : "Gagal.")}
          </p>
          <p className="mt-2 text-[#C9D1D9]">{activeFeedback?.explanation}</p>

          {lastResult.leakedObjects && (
            <pre className="mt-3 overflow-x-auto rounded bg-[#0D1117] p-3 text-xs text-[#F0883E]">
              {lastResult.leakedObjects.join("\n")}
            </pre>
          )}

          {lastResult.success && activeFeedback?.implementation_notes && (
            <pre className="mt-3 overflow-x-auto rounded bg-[#0D1117] p-3 text-xs text-[#8B949E]">
              {activeFeedback.implementation_notes}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}