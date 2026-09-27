// Save as: app/components/Materi/CertificateAwardedModal.tsx
"use client";

import Link from "next/link";

type AwardedCertification = { code: string; title: string; type: "subtopic" | "category" };

export default function CertificateAwardedModal({
  certifications,
  onClose,
}: {
  certifications: AwardedCertification[];
  onClose: () => void;
}) {
  if (certifications.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#21262D] bg-[#0D1117] p-6 shadow-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-[#F0883E]">
          Sertifikat Baru
        </p>

        <h2 className="mt-2 text-lg font-semibold text-[#E6EDF3]">
          {certifications.length > 1
            ? "Kamu mendapatkan beberapa sertifikat sekaligus."
            : "Kamu mendapatkan sertifikat baru."}
        </h2>

        <ul className="mt-4 space-y-2">
          {certifications.map((cert) => (
            <li
              key={cert.code}
              className="rounded-md border border-[#238636]/40 bg-[#238636]/10 px-4 py-3 text-sm text-[#3FB950]"
            >
              <span className="mr-2 rounded-full border border-[#238636]/40 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {cert.type === "category" ? "Kategori" : "Subtopik"}
              </span>
              {cert.title}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/sertifikat"
            className="rounded-md bg-[#F0883E] py-3 text-center text-sm font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90"
          >
            Lihat Sertifikat Saya
          </Link>
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