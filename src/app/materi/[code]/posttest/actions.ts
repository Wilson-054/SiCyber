// Save as: src/app/materi/[code]/posttest/actions.ts (MENGGANTIKAN versi lama)
"use server";

import { createClient } from "@/../utils/supabase/server";
import { getCategorySequenceState } from "@/../utils/progress-lock";
import {
  computeAttemptStatus,
  isPassing,
  POSTTEST_DURATION_MS,
  POSTTEST_GRACE_MS,
  POSTTEST_KIND,
  type AttemptStatus,
} from "@/../utils/Quiz/posttest";

// ---------------------------------------------------------------------------
// Model percobaan
//   - Satu baris quiz_results (kind 'posttest') = satu percobaan.
//   - Baris DIBUAT saat user menekan Mulai (created_at = waktu mulai,
//     expires_at = created_at + 60 menit, submitted_at = null, score = null).
//   - Selama berjalan, jawaban disimpan sebagai DRAF di kolom `answers`
//     ({ questionId: optionId }) lewat saveDraftAnswers.
//   - Baris DISELESAIKAN saat kirim (score, total, answers, submitted_at).
//   - Percobaan terbuka yang lewat waktu tapi tidak pernah dikirim (tab
//     ditutup) ditutup secara lazy: DRAF TERAKHIR dinilai di server, soal
//     tanpa jawaban dihitung salah. submitted_at = expires_at.
//   - Unique partial index menjamin maksimal satu percobaan terbuka per
//     (user, kategori). Lihat posttest-timer-migration.sql.
//   - Semua UPDATE ke quiz_results butuh policy UPDATE (lihat catatan RLS).
// ---------------------------------------------------------------------------

export type PosttestQuestionDTO = {
  id: string;
  question_text: string;
  order_index: number;
  quiz_options: { id: string; option_text: string; order_index: number }[];
};

export type StartPosttestSuccess = {
  ok: true;
  expiresAt: string;
  /** Jam server (ms epoch) saat respons dibuat, untuk koreksi selisih jam client. */
  serverNow: number;
  resumed: boolean;
  questions: PosttestQuestionDTO[];
  status: AttemptStatus;
  /** Draf jawaban tersimpan { questionId: optionId }. Kosong untuk percobaan baru. */
  draftAnswers: Record<string, string>;
};

export type StartPosttestResult =
  | StartPosttestSuccess
  | { ok: false; error: string; status?: AttemptStatus };

export type SaveDraftResult =
  | { ok: true; savedAt: number }
  | { ok: false; error: string; attemptClosed?: boolean };

export type PosttestReviewItem = {
  questionId: string;
  correctOptionId: string;
  explanation: string | null;
};

export type PosttestCertificate = {
  code: string;
  name: string;
  issuedAt: string;
  /** True bila sertifikat ini baru didapat dari percobaan ini. */
  newlyEarned: boolean;
};

export type SubmitPosttestSuccess = {
  ok: true;
  score: number;
  total: number;
  passed: boolean;
  /** True bila dikirim setelah expires_at (masih dalam toleransi). */
  timedOut: boolean;
  review: PosttestReviewItem[];
  status: AttemptStatus;
  certificate: PosttestCertificate | null;
};

export type SubmitPosttestResult =
  | SubmitPosttestSuccess
  | { ok: false; error: string; status?: AttemptStatus; attemptClosed?: boolean };

type Supabase = Awaited<ReturnType<typeof createClient>>;

type AttemptRow = {
  id: string;
  created_at: string;
  submitted_at: string | null;
  expires_at: string | null;
  score: number | null;
  total: number | null;
  answers: Record<string, string> | null;
};

type KeyedQuestion = {
  id: string;
  explanation: string | null;
  quiz_options: { id: string; score_value: number }[];
};

function logDbError(tag: string, error: { code?: string; message: string; details?: string; hint?: string }) {
  console.error(tag, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

async function loadAttempts(
  supabase: Supabase,
  userId: string,
  categoryId: string
): Promise<AttemptRow[]> {
  const { data, error } = await supabase
    .from("quiz_results")
    .select("id, created_at, submitted_at, expires_at, score, total, answers")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .eq("kind", POSTTEST_KIND);
  if (error) {
    logDbError("[loadAttempts] select quiz_results gagal", error);
    throw new Error("Gagal memeriksa riwayat percobaan.");
  }
  return (data ?? []) as AttemptRow[];
}

// Soal beserta kunci. HANYA dipakai di server untuk menilai, tidak pernah
// dikirim ke client.
async function loadKeyedQuestions(
  supabase: Supabase,
  categoryId: string
): Promise<KeyedQuestion[]> {
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("id, explanation, quiz_options(id, score_value)")
    .eq("category_id", categoryId)
    .eq("kind", POSTTEST_KIND);
  if (error || !data || data.length === 0) throw new Error("Gagal memuat soal.");
  return data as unknown as KeyedQuestion[];
}

// Menilai jawaban terhadap kunci. Jawaban kosong atau id tidak valid dihitung
// salah (bukan galat). `stored` hanya berisi jawaban yang valid.
function scoreAnswers(questions: KeyedQuestion[], answers: Record<string, string>) {
  let score = 0;
  const review: PosttestReviewItem[] = [];
  const stored: Record<string, string> = {};

  for (const q of questions) {
    const options = q.quiz_options ?? [];
    const key = options.reduce((best, o) => (o.score_value > best.score_value ? o : best));
    if (!key || key.score_value <= 0) throw new Error("Kunci jawaban soal belum diatur.");

    const chosen = options.find((o) => o.id === answers[q.id]);
    if (chosen) {
      stored[q.id] = chosen.id;
      if (chosen.score_value > 0) score += 1;
    }

    review.push({
      questionId: q.id,
      correctOptionId: key.id,
      explanation: q.explanation ?? null,
    });
  }

  return { score, total: questions.length, review, stored };
}

// Tutup percobaan terbuka yang lewat waktu dengan menilai DRAF terakhir.
// Guard `submitted_at is null` mencegah menimpa percobaan yang barusan
// dikirim dari tab lain.
async function closeWithDraft(
  supabase: Supabase,
  attempt: AttemptRow,
  questions: KeyedQuestion[],
  submittedAtIso: string
) {
  const draft =
    attempt.answers && typeof attempt.answers === "object" ? attempt.answers : {};
  const { score, total, stored } = scoreAnswers(questions, draft);

  const { error } = await supabase
    .from("quiz_results")
    .update({ score, total, answers: stored, submitted_at: submittedAtIso })
    .eq("id", attempt.id)
    .is("submitted_at", null);
  if (error) logDbError("[closeWithDraft] update quiz_results gagal", error);
}

// ===========================================================================
// START: mencatat percobaan SEBELUM soal dikirim ke user
// ===========================================================================
export async function startPosttest(categoryId: string): Promise<StartPosttestResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Kamu harus login untuk mengerjakan post-test." };

    const { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .maybeSingle();
    if (categoryError) return { ok: false, error: "Gagal memuat kategori." };
    if (!category) return { ok: false, error: "Kategori tidak ditemukan." };

    const state = await getCategorySequenceState(supabase, user.id, category.id);
    if (!state.posttest.available) return { ok: false, error: "Kategori ini belum punya post-test." };
    if (!state.posttest.unlocked) {
      return { ok: false, error: "Post-test masih terkunci. Selesaikan semua materi dan latihan dulu." };
    }

    // Kunci jawaban (score_value) SENGAJA tidak ikut di-select.
    const { data: questions, error: questionsError } = await supabase
      .from("quiz_questions")
      .select("id, question_text, order_index, quiz_options(id, option_text, order_index)")
      .eq("category_id", category.id)
      .eq("kind", POSTTEST_KIND)
      .order("order_index", { ascending: true });
    if (questionsError || !questions || questions.length === 0) {
      return { ok: false, error: "Gagal memuat soal." };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let attempts = await loadAttempts(supabase, user.id, category.id);

    let open = attempts.find((a) => !a.submitted_at);
    let resumed = false;

    if (open) {
      const expiresMs = open.expires_at ? new Date(open.expires_at).getTime() : 0;
      if (expiresMs >= nowMs) {
        resumed = true; // masih berjalan: lanjutkan, jangan buat percobaan baru
      } else {
        // Lewat waktu dan tidak pernah dikirim: nilai draf terakhir.
        const keyed = await loadKeyedQuestions(supabase, category.id);
        await closeWithDraft(supabase, open, keyed, open.expires_at ?? nowIso);
        // Muat ulang supaya hitungan jatah dan status percobaan akurat.
        attempts = await loadAttempts(supabase, user.id, category.id);
        open = undefined;
      }
    }

    const createdTimes = attempts.map((a) => a.created_at);
    const dto = questions as unknown as PosttestQuestionDTO[];

    if (resumed && open) {
      return {
        ok: true,
        expiresAt: open.expires_at as string,
        serverNow: nowMs,
        resumed: true,
        questions: dto,
        status: computeAttemptStatus(createdTimes, nowMs),
        draftAnswers: open.answers && typeof open.answers === "object" ? open.answers : {},
      };
    }

    const before = computeAttemptStatus(createdTimes, nowMs);
    if (before.remaining <= 0) {
      return {
        ok: false,
        error: "Percobaanmu habis. Tunggu sampai satu percobaan kembali.",
        status: before,
      };
    }

    const expiresAt = new Date(nowMs + POSTTEST_DURATION_MS).toISOString();
    const { error: insertError } = await supabase.from("quiz_results").insert({
      user_id: user.id,
      category_id: category.id,
      kind: POSTTEST_KIND,
      attempt_id: crypto.randomUUID(),
      total: questions.length,
      source: "quiz",
      answers: {},
      created_at: nowIso,
      expires_at: expiresAt,
    });

    if (insertError) {
      logDbError("[startPosttest] insert quiz_results gagal", insertError);
      // 23505 = unique violation: tab lain baru saja memulai percobaan.
      if (insertError.code === "23505") {
        return { ok: false, error: "Ada percobaan lain yang sedang berjalan. Muat ulang halaman ini." };
      }
      return { ok: false, error: "Gagal memulai percobaan. Coba lagi." };
    }

    return {
      ok: true,
      expiresAt,
      serverNow: nowMs,
      resumed: false,
      questions: dto,
      status: computeAttemptStatus([...createdTimes, nowIso], nowMs),
      draftAnswers: {},
    };
  } catch (e) {
    console.error("[startPosttest] galat tak terduga", e);
    return { ok: false, error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." };
  }
}

// ===========================================================================
// DRAFT: menyimpan jawaban sementara di quiz_results.answers
// Hanya diterima untuk percobaan terbuka dan sebelum expires_at + toleransi.
// Isi difilter: hanya pasangan (soal, opsi) yang valid yang disimpan.
// ===========================================================================
export async function saveDraftAnswers(
  categoryId: string,
  answers: Record<string, string>
): Promise<SaveDraftResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Kamu harus login." };

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return { ok: false, error: "Format jawaban tidak valid." };
    }

    const attempts = await loadAttempts(supabase, user.id, categoryId);
    const open = attempts.find((a) => !a.submitted_at);
    if (!open) {
      return { ok: false, error: "Tidak ada percobaan yang sedang berjalan.", attemptClosed: true };
    }

    const nowMs = Date.now();
    const expiresMs = open.expires_at ? new Date(open.expires_at).getTime() : 0;
    if (nowMs > expiresMs + POSTTEST_GRACE_MS) {
      return { ok: false, error: "Waktu sudah habis.", attemptClosed: true };
    }

    // Hanya id soal dan id opsi (tanpa kunci) yang dibutuhkan untuk validasi.
    const { data: questions, error: questionsError } = await supabase
      .from("quiz_questions")
      .select("id, quiz_options(id)")
      .eq("category_id", categoryId)
      .eq("kind", POSTTEST_KIND);
    if (questionsError || !questions) return { ok: false, error: "Gagal memuat soal." };

    const clean: Record<string, string> = {};
    for (const q of questions as unknown as { id: string; quiz_options: { id: string }[] }[]) {
      const chosen = answers[q.id];
      if (typeof chosen === "string" && (q.quiz_options ?? []).some((o) => o.id === chosen)) {
        clean[q.id] = chosen;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("quiz_results")
      .update({ answers: clean })
      .eq("id", open.id)
      .is("submitted_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) {
      logDbError("[saveDraftAnswers] update quiz_results gagal", updateError);
      return { ok: false, error: "Gagal menyimpan draf." };
    }
    if (!updated) {
      console.error(
        "[saveDraftAnswers] update 0 baris. Percobaan sudah dikirim, atau RLS tanpa policy UPDATE.",
        { attemptId: open.id }
      );
      return { ok: false, error: "Percobaan sudah berakhir.", attemptClosed: true };
    }

    return { ok: true, savedAt: nowMs };
  } catch (e) {
    console.error("[saveDraftAnswers] galat tak terduga", e);
    return { ok: false, error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." };
  }
}

// ===========================================================================
// SUBMIT: menilai di server terhadap percobaan terbuka
// Jawaban yang kosong dianggap salah, jadi auto-submit saat waktu habis
// boleh membawa jawaban parsial.
// ===========================================================================
export async function submitPosttest(
  categoryId: string,
  answers: Record<string, string>
): Promise<SubmitPosttestResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Kamu harus login untuk mengerjakan post-test." };

    const attempts = await loadAttempts(supabase, user.id, categoryId);
    const open = attempts.find((a) => !a.submitted_at);
    if (!open) {
      return {
        ok: false,
        error: "Tidak ada percobaan yang sedang berjalan. Mulai percobaan baru dari halaman post-test.",
        attemptClosed: true,
      };
    }

    const questions = await loadKeyedQuestions(supabase, categoryId);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresMs = open.expires_at ? new Date(open.expires_at).getTime() : 0;

    // Terlambat melewati toleransi: payload ini ditolak, tapi DRAF terakhir
    // (yang tersimpan sebelum waktu habis) tetap dinilai.
    if (nowMs > expiresMs + POSTTEST_GRACE_MS) {
      await closeWithDraft(supabase, open, questions, open.expires_at ?? nowIso);
      return {
        ok: false,
        error:
          "Waktu habis dan jawabanmu terlambat dikirim. Jawaban terakhir yang tersimpan sebagai draf sudah dinilai.",
        status: computeAttemptStatus(attempts.map((a) => a.created_at), nowMs),
        attemptClosed: true,
      };
    }

    const { score, total, review, stored } = scoreAnswers(questions, answers ?? {});

    // Guard `submitted_at is null`: kirim ganda (dua tab, klik ganda) hanya
    // diterima sekali.
    const { data: updated, error: updateError } = await supabase
      .from("quiz_results")
      .update({ score, total, answers: stored, submitted_at: nowIso })
      .eq("id", open.id)
      .is("submitted_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) {
      logDbError("[submitPosttest] update quiz_results gagal", updateError);
      return { ok: false, error: "Gagal menyimpan hasil. Coba kirim ulang." };
    }
    if (!updated) {
      // 0 baris terupdate. Bedakan "sudah dikirim" dari "penulisan diblokir diam-diam".
      const { data: check } = await supabase
        .from("quiz_results")
        .select("id, submitted_at")
        .eq("id", open.id)
        .maybeSingle();
      if (check && !check.submitted_at) {
        console.error(
          "[submitPosttest] update 0 baris padahal percobaan masih terbuka. Kemungkinan RLS tanpa policy UPDATE.",
          { attemptId: open.id }
        );
        return { ok: false, error: "Gagal menyimpan hasil: penulisan ke database ditolak." };
      }
      return { ok: false, error: "Percobaan ini sudah dikirim sebelumnya.", attemptClosed: true };
    }

    const passed = isPassing(score, total);
    let certificate: PosttestCertificate | null = null;

    if (passed) {
      const { data: category } = await supabase
        .from("categories")
        .select("code, name")
        .eq("id", categoryId)
        .maybeSingle();

      const earlierPass = attempts
        .filter((a) => a.id !== open.id && a.submitted_at && isPassing(a.score, a.total))
        .map((a) => a.submitted_at as string)
        .sort()[0];

      if (category) {
        certificate = {
          code: category.code,
          name: category.name,
          issuedAt: earlierPass ?? nowIso,
          newlyEarned: !earlierPass,
        };
      }
    }

    return {
      ok: true,
      score,
      total,
      passed,
      timedOut: nowMs > expiresMs,
      review,
      status: computeAttemptStatus(attempts.map((a) => a.created_at), nowMs),
      certificate,
    };
  } catch (e) {
    console.error("[submitPosttest] galat tak terduga", e);
    return { ok: false, error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." };
  }
}