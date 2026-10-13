// Save as: app/components/Materi/MarkCompleteButton.tsx (replaces existing file)
"use client";

import { useState, useTransition } from "react";
import {
  markMaterialComplete,
  getNextRecommendedCategoryAction,
} from "@/app/materi/actions";
import NextCategoryPrompt from "@/app/components/Materi/NextCategoryPrompt";
import CertificateAwardedModal, {
  type AwardedCertification,
} from "@/app/components/Materi/CertificateAwardedModal";

type RecommendedCategory = { id: string; code: string; name: string } | null;

export default function MarkCompleteButton({
  materialId,
  categoryId,
  categoryCode,
  initialCompleted,
  isLastMaterial,
}: {
  materialId: string;
  categoryId: string;
  categoryCode: string;
  initialCompleted: boolean;
  isLastMaterial: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPrompt, setShowPrompt] = useState(false);
  const [recommended, setRecommended] = useState<RecommendedCategory>(null);
  const [newCertifications, setNewCertifications] = useState<AwardedCertification[]>([]);
  const [showCertModal, setShowCertModal] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markMaterialComplete(materialId, categoryId, categoryCode);
        setCompleted(true);

        if (result.newCertifications.length > 0) {
          setNewCertifications(result.newCertifications);
          setShowCertModal(true);
        }

        if (isLastMaterial && !initialCompleted) {
          const next = await getNextRecommendedCategoryAction(categoryId);
          setRecommended(next);
          setShowPrompt(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal menyimpan progres.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={handleClick}
        disabled={completed || isPending}
        className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
          completed
            ? "border border-[#238636]/40 bg-[#238636]/10 text-[#3FB950]"
            : "bg-[#F0883E] text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-60"
        }`}
      >
        {completed ? "✓ Selesai" : isPending ? "Menyimpan…" : "Tandai Selesai"}
      </button>
      {error && <p className="text-xs text-[#F85149]">{error}</p>}

      {/* Modal sertifikat ditampilkan lebih dulu; prompt kategori berikutnya
          menunggu sampai modal sertifikat ditutup supaya tidak tumpang tindih. */}
      {showCertModal && (
        <CertificateAwardedModal
          certifications={newCertifications}
          onClose={() => setShowCertModal(false)}
        />
      )}

      {showPrompt && !showCertModal && (
        <NextCategoryPrompt
          recommended={recommended}
          onClose={() => setShowPrompt(false)}
        />
      )}
    </div>
  );
}