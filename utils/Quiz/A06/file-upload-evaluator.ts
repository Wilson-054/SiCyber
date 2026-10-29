// Save as: utils/Quiz/A06/lab1/file-upload-evaluator.ts

// Mensimulasikan server yang menyimpan file dengan nama aslinya di folder
// yang bisa diakses lewat web, tanpa validasi ulang di sisi server. Tidak
// ada upload sungguhan dan tidak ada isi file yang pernah dibaca/dikirim —
// peserta memilih file sungguhan lewat <input type="file">, tapi yang
// dievaluasi cuma file.name (nama file). "Kunjungi URL" di UI me-render
// halaman yang sudah disiapkan di sini (simulated_outcome / benign_outcome),
// bukan hasil pemrosesan file sungguhan.

export type FileUploadSampleFile = {
  filename: string;
  label: string;
  // Isi dummy untuk file yang bisa diunduh peserta sebagai bahan percobaan.
  // Boleh "diubah nama" sebelum diunggah ulang — itu justru poin latihannya.
  content: string;
};

export type UnrestrictedFileUploadCriteria = {
  type: "unrestricted_file_upload_simulation";
  app_name: string;
  feature_context: string;
  declared_allowed_extensions: string[];
  server_side_validation: boolean;
  executable_extensions: string[];
  match_rule: "any_extension_segment_case_insensitive";
  sample_files: FileUploadSampleFile[];
  simulated_outcome: {
    layanan: string;
    info: string;
  };
  // Ditampilkan saat file "divisit" tapi ekstensinya BUKAN executable —
  // supaya peserta juga melihat kontras perilaku normal vs rentan.
  benign_outcome: {
    layanan: string;
    info: string;
  };
};

export type FileUploadFailureReason =
  | "no_filename_entered"
  | "no_extension_segment"
  | "extension_not_executable";

export type FileUploadAttemptResult = {
  success: boolean;
  reason: FileUploadFailureReason | "ok";
  matchedExtension?: string;
  matchedSegmentIndex?: number;
};

export function evaluateFileUploadAttempt(
  criteria: UnrestrictedFileUploadCriteria,
  filenameInput: string
): FileUploadAttemptResult {
  const trimmed = filenameInput.trim();
  if (!trimmed) {
    return { success: false, reason: "no_filename_entered" };
  }

  // Pisah berdasarkan titik; segmen pertama adalah nama dasar, sisanya
  // adalah kandidat ekstensi (mendukung nama file dua ekstensi sekaligus,
  // mis. "dokumen.jpg.php").
  const segments = trimmed.split(".");
  if (segments.length < 2) {
    return { success: false, reason: "no_extension_segment" };
  }

  const extensionSegments = segments.slice(1).map((s) => s.toLowerCase());
  const executableSet = new Set(
    criteria.executable_extensions.map((e) => e.toLowerCase())
  );

  for (let i = 0; i < extensionSegments.length; i++) {
    if (executableSet.has(extensionSegments[i])) {
      return {
        success: true,
        reason: "ok",
        matchedExtension: extensionSegments[i],
        matchedSegmentIndex: i + 1, // index relatif ke `segments` asli
      };
    }
  }

  return { success: false, reason: "extension_not_executable" };
}