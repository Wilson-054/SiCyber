// Save as: app/components/Sertifikat/CertificateCard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import templateImage from "@/app/sertifikat/templates/sertifikat.png";

type Certificate = {
  code: string;
  title: string;
  type: "exercise" | "category";
  issued_at: string;
};

const TEMPLATE_SRC = templateImage.src;
const REF_W = 2000; // semua koordinat di bawah relatif terhadap lebar 2000px

// Posisi & gaya teks (sesuaikan di sini kalau ada yang kurang pas)
const LAYOUT = {
  name:  { y: 610,  maxWidth: 1300, startSize: 110, minSize: 50, color: "#8B5A2B", weight: 700 },
  title: { y: 858,  maxWidth: 1500, startSize: 46,  minSize: 28, color: "#111111", weight: 500 },
  date:  { y: 1085, maxWidth: 1200, startSize: 34,  minSize: 24, color: "#5A4630", weight: 500 },
};

let fontsReady: Promise<void> | null = null;
function ensureFonts() {
  if (!fontsReady) {
    fontsReady = (async () => {
      try {
        const faces = [
          new FontFace("Poppins", "url(/fonts/Poppins-Medium.ttf)", { weight: "500" }),
          new FontFace("Poppins", "url(/fonts/Poppins-Bold.ttf)", { weight: "700" }),
        ];
        const loaded = await Promise.all(faces.map((f) => f.load()));
        loaded.forEach((f) => document.fonts.add(f));
      } catch {
        // fallback ke sans-serif bawaan kalau file font tidak ditemukan
      }
    })();
  }
  return fontsReady;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Template sertifikat tidak ditemukan."));
    img.src = src;
  });
}

function drawFitted(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  cfg: { y: number; maxWidth: number; startSize: number; minSize: number; color: string; weight: number },
  scale: number
) {
  let size = cfg.startSize * scale;
  const min = cfg.minSize * scale;
  const maxW = cfg.maxWidth * scale;
  ctx.font = `${cfg.weight} ${size}px Poppins, sans-serif`;
  while (ctx.measureText(text).width > maxW && size > min) {
    size -= 2 * scale;
    ctx.font = `${cfg.weight} ${size}px Poppins, sans-serif`;
  }
  ctx.fillStyle = cfg.color;
  ctx.fillText(text, x, cfg.y * scale);
}

async function renderCertificate(canvas: HTMLCanvasElement, cert: Certificate, name: string) {
  await ensureFonts();
  const img = await loadImage(TEMPLATE_SRC);

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const scale = img.naturalWidth / REF_W;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia.");

  ctx.drawImage(img, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = canvas.width / 2;

  const courseText = cert.type === "category" ? `Kategori ${cert.code}: ${cert.title}` : cert.title;
  const dateStr = new Date(cert.issued_at).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  drawFitted(ctx, name, cx, LAYOUT.name, scale);
  drawFitted(ctx, courseText, cx, LAYOUT.title, scale);
  drawFitted(ctx, `Diterbitkan pada ${dateStr}`, cx, LAYOUT.date, scale);
}

export default function CertificateCard({
  cert,
  displayName,
}: {
  cert: Certificate;
  displayName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!expanded || !canvasRef.current) return;
    setError(null);
    renderCertificate(canvasRef.current, cert, displayName).catch((e) =>
      setError(e instanceof Error ? e.message : "Gagal menampilkan sertifikat.")
    );
  }, [expanded, cert, displayName]);

  async function handleDownload() {
    setError(null);
    setDownloading(true);
    try {
      const canvas = document.createElement("canvas");
      await renderCertificate(canvas, cert, displayName);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat file gambar."))), "image/png")
      );
      const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sertifikat-${safe(cert.code)}-${safe(displayName)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunduh sertifikat.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-md border border-[#21262D] bg-[#161B22] px-5 py-5">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
            cert.type === "category"
              ? "border-[#F0883E]/40 text-[#F0883E]"
              : "border-[#21262D] text-[#8B949E]"
          }`}
        >
          {cert.type === "category" ? "Kategori" : "Latihan"}
        </span>
        <span className="font-mono text-xs text-[#8B949E]">
          {new Date(cert.issued_at).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>

      <h2 className="text-lg font-medium text-[#E6EDF3]">{cert.title}</h2>
      <p className="mt-3 font-mono text-xs text-[#8B949E]">Diberikan kepada {displayName}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="rounded-md border border-[#21262D] px-3 py-1.5 text-xs text-[#C9D1D9] transition-colors hover:border-[#F0883E] hover:text-[#F0883E]"
        >
          {expanded ? "Sembunyikan Sertifikat ▲" : "Lihat Sertifikat ▼"}
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-md bg-[#F0883E] px-3 py-1.5 text-xs font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90 disabled:opacity-60"
        >
          {downloading ? "Menyiapkan…" : "Download PNG"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-[#F85149]">{error}</p>}

      {expanded && (
        <div className="mt-5 overflow-hidden rounded-md border border-[#21262D]">
          <canvas ref={canvasRef} className="block h-auto w-full" />
        </div>
      )}
    </div>
  );
}