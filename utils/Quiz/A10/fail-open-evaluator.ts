// Save as: utils/Quiz/A10/lab1/fail-open-evaluator.ts

// Simulasi CWE-636 (Not Failing Securely / "Failing Open"). Dua komponen
// terpisah memeriksa ID dokumen yang sama:
//
// - Lapisan DATA (pencarian dokumen): PEMAAF terhadap bentuk ID — huruf
//   besar/kecil, spasi di mana saja, tanda baca di akhir, dan %20 semua
//   dianggap sama setelah dinormalisasi.
// - Lapisan OTORISASI (authz service): KETAT — memeriksa string APA
//   ADANYA, karakter demi karakter, terhadap ID resmi dokumen itu.
//
// Begitu ID yang diketik menyimpang sedikit saja dari bentuk resminya,
// lapisan data tetap menemukan dokumennya (karena memaafkan), tapi lapisan
// otorisasi tidak mengenali bentuk itu dan ERROR. Karena kode aplikasi
// fail-open, error itu diperlakukan sebagai izin diberikan — meski
// dokumen yang terbuka persis sama dengan yang tadinya ditolak secara
// normal. Peserta memicu error ini sendiri lewat eksperimen mengubah
// bentuk ID, bukan lewat tombol simulasi terpisah.

export type DocumentEntry = {
  id: string;
  title: string;
  authz_result: "allowed" | "denied";
  content: string;
};

export type FailOpenAuthzCriteria = {
  type: "fail_open_authz_bypass";
  app_name: string;
  feature_context: string;
  endpoint: string;
  logged_in_as: string;
  // Seluruh dokumen tampil terbuka di UI (tidak ada ID rahasia yang perlu
  // ditebak) — masing-masing berlabel jelas allowed/denied.
  documents: DocumentEntry[];
};

export type FailOpenFailureReason =
  | "no_id_entered"
  | "document_not_found"
  | "normal_allowed_access"
  | "normal_denied_access"
  | "disrupted_allowed_trivial";

export type AuthzStatus = "ALLOW" | "DENY" | "ERROR" | null;
export type AppDecision = "granted" | "denied" | null;

export type FailOpenAttemptResult = {
  success: boolean;
  reason: FailOpenFailureReason | "ok";
  authzStatus: AuthzStatus;
  appDecision: AppDecision;
  // true kalau layanan otorisasi gagal memproses permintaan ini sama
  // sekali (dipakai UI untuk menampilkan banner error yang mencolok,
  // terpisah dari status ALLOW/DENY biasa).
  serviceErrored: boolean;
  documentTitle?: string;
  documentContent?: string;
};

// Lapisan data: pemaaf. Huruf besar/kecil diabaikan, semua spasi (termasuk
// %20 yang didekode) dibuang, dan tanda baca umum di ujung string dibuang.
function normalizeForLookup(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/%20/gi, " ")
    .replace(/\s+/g, "")
    .replace(/[.,;]+$/, "");
}

export function evaluateFailOpenAttempt(
  criteria: FailOpenAuthzCriteria,
  rawInput: string
): FailOpenAttemptResult {
  if (!rawInput.trim()) {
    return {
      success: false,
      reason: "no_id_entered",
      authzStatus: null,
      appDecision: null,
      serviceErrored: false,
    };
  }

  const normalizedInput = normalizeForLookup(rawInput);
  const doc = criteria.documents.find((d) => normalizeForLookup(d.id) === normalizedInput);

  if (!doc) {
    return {
      success: false,
      reason: "document_not_found",
      authzStatus: null,
      appDecision: null,
      serviceErrored: false,
    };
  }

  // Lapisan otorisasi memeriksa string APA ADANYA, tanpa normalisasi sama
  // sekali — begitu berbeda satu karakter pun dari ID resmi, ia error.
  const exactMatch = rawInput === doc.id;

  if (exactMatch) {
    if (doc.authz_result === "allowed") {
      return {
        success: false,
        reason: "normal_allowed_access",
        authzStatus: "ALLOW",
        appDecision: "granted",
        serviceErrored: false,
        documentTitle: doc.title,
        documentContent: doc.content,
      };
    }
    return {
      success: false,
      reason: "normal_denied_access",
      authzStatus: "DENY",
      appDecision: "denied",
      serviceErrored: false,
      documentTitle: doc.title,
    };
  }

  // ID menyimpang dari bentuk resmi -> lapisan otorisasi error -> fail-open
  // tetap memberi akses, terlepas dari status aslinya.
  if (doc.authz_result === "allowed") {
    return {
      success: false,
      reason: "disrupted_allowed_trivial",
      authzStatus: "ERROR",
      appDecision: "granted",
      serviceErrored: true,
      documentTitle: doc.title,
      documentContent: doc.content,
    };
  }

  return {
    success: true,
    reason: "ok",
    authzStatus: "ERROR",
    appDecision: "granted",
    serviceErrored: true,
    documentTitle: doc.title,
    documentContent: doc.content,
  };
}