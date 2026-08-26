"use client";

import { useRouter } from "next/navigation";

type RecommendedCategory = { id: string; code: string; name: string } | null;

export default function NextCategoryPrompt({
  recommended,
  onClose,
}: {
  recommended: RecommendedCategory;
  onClose: () => void;
}) {
  const router = useRouter();

  function goToCategory() {
    if (!recommended) return;
    router.push(`/materi/${recommended.code}`);
  }

  function goToCategoryList() {
    router.push("/materi");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#21262D] bg-[#0D1117] p-6 shadow-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-[#F0883E]">
          Kategori Selesai
        </p>

        <h2 className="mt-2 text-lg font-semibold text-[#E6EDF3]">
          Kamu sudah menyelesaikan seluruh materi kategori ini.
        </h2>

        {recommended ? (
          <p className="mt-3 text-sm leading-relaxed text-[#8B949E]">
            Berdasarkan hasil onboarding kamu, kami merekomendasikan lanjut ke{" "}
            <span className="font-medium text-[#E6EDF3]">
              {recommended.name}
            </span>{" "}
            ({recommended.code}).
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-[#8B949E]">
            Kamu sudah menyelesaikan semua kategori yang tersedia. Kerja
            bagus.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {recommended && (
            <button
              onClick={goToCategory}
              className="rounded-md bg-[#F0883E] py-3 text-sm font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90"
            >
              Lanjut ke {recommended.name}
            </button>
          )}

          <button
            onClick={goToCategoryList}
            className="rounded-md border border-[#21262D] py-3 text-sm text-[#C9D1D9] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
          >
            Pilih kategori lain sendiri
          </button>

          <button
            onClick={onClose}
            className="py-2 text-xs text-[#8B949E] transition-colors hover:text-[#C9D1D9]"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}