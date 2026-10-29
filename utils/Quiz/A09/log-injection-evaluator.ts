// Save as: utils/Quiz/A09/lab1/log-injection-evaluator.ts

// Simulasi manipulasi isi log (CWE-117 / log injection / log forging).
// Peserta mengisi field "username" pada form login tersimulasi. Nilainya
// ditulis APA ADANYA ke satu baris log (tanpa dinetralkan), persis seperti
// contoh rentan di materi. Kalau peserta menyisipkan karakter baris baru
// lalu menyusun baris yang MENYERUPAI FORMAT entri log asli (timestamp +
// level), baris itu akan tampil sebagai "kejadian" yang sebenarnya tidak
// pernah terjadi — terlepas dari apa isi pesannya. Pesannya sendiri bebas;
// yang dinilai adalah apakah bentuknya meniru format log server, bukan
// kata kunci tertentu. Tidak ada file log sungguhan — semuanya dirender
// ulang dari template di criteria, murni string/regex manipulation.

export type LogInjectionCriteria = {
  type: "log_injection_forge_entry";
  app_name: string;
  feature_context: string;
  endpoint: string;
  // "{timestamp} WARNING Login gagal untuk user: {username}"
  log_line_template: string;
  log_levels: string[]; // mis. ["INFO", "WARNING", "ERROR"] — ditampilkan sebagai petunjuk
  // Pola regex (sebagai string) yang menggambarkan "bentuk" satu baris log
  // yang sah di aplikasi ini: timestamp + level + pesan bebas. Pesan
  // setelah level TIDAK dibatasi isinya sama sekali.
  log_format_regex: string;
  sample_timestamp: string;
};

export type LogInjectionFailureReason =
  | "no_input_entered"
  | "no_newline_used"
  | "forged_entry_format_mismatch";

export type LogInjectionAttemptResult = {
  success: boolean;
  reason: LogInjectionFailureReason | "ok";
  // Baris-baris log hasil render, ditampilkan di UI sebagai "log viewer"
  // supaya peserta melihat persis bagaimana entrinya akan terbaca oleh
  // siapa pun yang membuka log itu. Hanya diisi kalau newline terdeteksi.
  renderedLines?: string[];
  matchedLineIndex?: number;
};

export function evaluateLogInjectionAttempt(
  criteria: LogInjectionCriteria,
  usernameInput: string
): LogInjectionAttemptResult {
  if (!usernameInput.trim()) {
    return { success: false, reason: "no_input_entered" };
  }

  const hasNewline = /\r|\n/.test(usernameInput);
  if (!hasNewline) {
    return { success: false, reason: "no_newline_used" };
  }

  const lines = usernameInput.split(/\r\n|\r|\n/);
  const firstLineUsername = lines[0];
  const forgedLines = lines.slice(1);

  const firstRenderedLine = criteria.log_line_template
    .replace("{timestamp}", criteria.sample_timestamp)
    .replace("{username}", firstLineUsername);
  const renderedLines = [firstRenderedLine, ...forgedLines];

  // Cocokkan tiap baris yang disisipkan terhadap BENTUK log yang sah —
  // bukan terhadap kata kunci tertentu. Isi pesannya bebas sepenuhnya.
  const formatRegex = new RegExp(criteria.log_format_regex, "i");
  const matchedIndex = forgedLines.findIndex((line) => formatRegex.test(line.trim()));

  if (matchedIndex === -1) {
    return { success: false, reason: "forged_entry_format_mismatch", renderedLines };
  }

  return {
    success: true,
    reason: "ok",
    renderedLines,
    matchedLineIndex: matchedIndex + 1, // +1 karena index 0 di renderedLines adalah baris pertama
  };
}