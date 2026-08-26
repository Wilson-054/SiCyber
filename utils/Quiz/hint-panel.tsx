// Save as: app/components/Exercise/HintPanel.tsx
"use client";

import { useState, useTransition } from "react";
import { recordHintRevealed, type ProgressCounters } from "@/../utils/Quiz/exercise-progress";

type Hint = { id: string; hint_order: number; content: string };

export default function HintPanel({
  hints,
  categoryId,
  exerciseId,
  initialHintsUsed,
  onCountersUpdate,
}: {
  hints: Hint[];
  categoryId: string;
  exerciseId: string;
  initialHintsUsed: number;
  onCountersUpdate: (c: ProgressCounters) => void;
}) {
  const [revealedCount, setRevealedCount] = useState(Math.min(initialHintsUsed, hints.length));
  const [isPending, startTransition] = useTransition();

  const revealNext = () => {
    if (revealedCount >= hints.length) return;
    startTransition(async () => {
      const result = await recordHintRevealed(categoryId, exerciseId);
      setRevealedCount((c) => c + 1);
      if (result) onCountersUpdate(result);
    });
  };

  return (
    <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider text-[#8B949E]">
          Hint ({revealedCount}/{hints.length})
        </h3>
        {revealedCount < hints.length && (
          <button
            onClick={revealNext}
            disabled={isPending}
            className="rounded border border-[#21262D] px-3 py-1 text-xs text-[#F0883E] hover:border-[#F0883E]/50 disabled:opacity-50"
          >
            {isPending ? "Memuat…" : "Tampilkan hint berikutnya"}
          </button>
        )}
      </div>

      {revealedCount === 0 && <p className="text-sm text-[#8B949E]">Belum ada hint yang ditampilkan.</p>}

      <ol className="space-y-2">
        {hints.slice(0, revealedCount).map((h) => (
          <li key={h.id} className="rounded bg-[#0D1117] px-3 py-2 text-sm text-[#C9D1D9]">
            <span className="mr-2 font-mono text-xs text-[#F0883E]">#{h.hint_order}</span>
            {h.content}
          </li>
        ))}
      </ol>
    </div>
  );
}