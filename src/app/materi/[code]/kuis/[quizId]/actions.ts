
"use server";

import { createClient } from "@/../utils/supabase/server";
import { getQuizAccess } from "@/../utils/progress-lock";
import {
  computeAttemptStatus,
  getQuizById,
  isPassing,
  QUIZ_DURATION_MS,
  QUIZ_GRACE_MS,
  type AttemptStatus,
} from "@/../utils/Quiz/quiz";

export type QuizQuestionDTO = {
  id: string;
  question_text: string;
  order_index: number;
  quiz_options: { id: string; option_text: string; order_index: number }[];
};

export type StartQuizSuccess = {
  ok: true;
  expiresAt: string;
  serverNow: number;
  resumed: boolean;
  questions: QuizQuestionDTO[];
  status: AttemptStatus;
  draftAnswers: Record<string, string>;
};

export type StartQuizResult =
  | StartQuizSuccess
  | { ok: false; error: string; status?: AttemptStatus };

export type SaveDraftResult =
  | { ok: true; savedAt: number }
  | { ok: false; error: string; attemptClosed?: boolean };

export type QuizReviewItem = {
  questionId: string;
  correctOptionId: string;
  explanation: string | null;
};

export type QuizCertificate = {
  code: string;
  name: string;
  issuedAt: string;
  newlyEarned: boolean;
};

export type SubmitQuizSuccess = {
  ok: true;
  score: number;
  total: number;
  passed: boolean;
  timedOut: boolean;
  review: QuizReviewItem[];
  status: AttemptStatus;
  certificate: QuizCertificate | null;
};

export type SubmitQuizResult =
  | SubmitQuizSuccess
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

function unexpected(tag: string, e: unknown) {
  console.error(tag, e);
  return { ok: false as const, error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." };
}

async function loadAttempts(supabase: Supabase, userId: string, quizId: string): Promise<AttemptRow[]> {
  const { data, error } = await supabase
    .from("quiz_results")
    .select("id, created_at, submitted_at, expires_at, score, total, answers")
    .eq("user_id", userId)
    .eq("quiz_id", quizId);
  if (error) {
    logDbError("[loadAttempts] select quiz_results gagal", error);
    throw new Error("Gagal memeriksa riwayat percobaan.");
  }
  return (data ?? []) as AttemptRow[];
}

async function loadKeyedQuestions(supabase: Supabase, quizId: string): Promise<KeyedQuestion[]> {
  const { data, error } = await supabase
    .from("quiz_questions")
    .select("id, explanation, quiz_options(id, score_value)")
    .eq("quiz_id", quizId);
  if (error || !data || data.length === 0) throw new Error("Gagal memuat soal.");
  return data as unknown as KeyedQuestion[];
}

function scoreAnswers(questions: KeyedQuestion[], answers: Record<string, string>) {
  let score = 0;
  const review: QuizReviewItem[] = [];
  const stored: Record<string, string> = {};

  for (const q of questions) {
    const options = q.quiz_options ?? [];
    if (options.length === 0) throw new Error("Soal belum punya pilihan jawaban.");
    const key = options.reduce((best, o) => (o.score_value > best.score_value ? o : best));
    if (key.score_value <= 0) throw new Error("Kunci jawaban soal belum diatur.");

    const chosen = options.find((o) => o.id === answers[q.id]);
    if (chosen) {
      stored[q.id] = chosen.id;
      if (chosen.score_value > 0) score += 1;
    }

    review.push({ questionId: q.id, correctOptionId: key.id, explanation: q.explanation ?? null });
  }

  return { score, total: questions.length, review, stored };
}

async function closeWithDraft(
  supabase: Supabase,
  attempt: AttemptRow,
  questions: KeyedQuestion[],
  submittedAtIso: string
) {
  const draft = attempt.answers && typeof attempt.answers === "object" ? attempt.answers : {};
  const { score, total, stored } = scoreAnswers(questions, draft);

  const { error } = await supabase
    .from("quiz_results")
    .update({ score, total, answers: stored, submitted_at: submittedAtIso })
    .eq("id", attempt.id)
    .is("submitted_at", null);
  if (error) logDbError("[closeWithDraft] update quiz_results gagal", error);
}

export async function startQuiz(quizId: string): Promise<StartQuizResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Kamu harus login untuk mengerjakan kuis." };

    const access = await getQuizAccess(supabase, user.id, quizId);
    if (access.status === "not_found") return { ok: false, error: "Kuis tidak ditemukan." };
    if (access.status === "locked") {
      return { ok: false, error: "Kuis ini masih terkunci. Selesaikan item sebelumnya terlebih dahulu." };
    }
    const { quiz } = access;

    const { data: questions, error: questionsError } = await supabase
      .from("quiz_questions")
      .select("id, question_text, order_index, quiz_options(id, option_text, order_index)")
      .eq("quiz_id", quiz.id)
      .order("order_index", { ascending: true });
    if (questionsError || !questions || questions.length === 0) {
      return { ok: false, error: "Gagal memuat soal." };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let attempts = await loadAttempts(supabase, user.id, quiz.id);

    let open = attempts.find((a) => !a.submitted_at);
    let resumed = false;

    if (open) {
      const expiresMs = open.expires_at ? new Date(open.expires_at).getTime() : 0;
      if (expiresMs >= nowMs) {
        resumed = true;
      } else {
        const keyed = await loadKeyedQuestions(supabase, quiz.id);
        await closeWithDraft(supabase, open, keyed, open.expires_at ?? nowIso);
        attempts = await loadAttempts(supabase, user.id, quiz.id);
        open = undefined;
      }
    }

    const createdTimes = attempts.map((a) => a.created_at);
    const dto = questions as unknown as QuizQuestionDTO[];

    if (resumed && open) {
      return {
        ok: true,
        expiresAt: open.expires_at as string,
        serverNow: nowMs,
        resumed: true,
        questions: dto,
        status: computeAttemptStatus(createdTimes, quiz.maxAttempts, nowMs),
        draftAnswers: open.answers && typeof open.answers === "object" ? open.answers : {},
      };
    }

    const before = computeAttemptStatus(createdTimes, quiz.maxAttempts, nowMs);
    if (before.remaining !== null && before.remaining <= 0) {
      return {
        ok: false,
        error: "Percobaanmu habis. Tunggu sampai satu percobaan kembali.",
        status: before,
      };
    }

    const expiresAt = new Date(nowMs + QUIZ_DURATION_MS).toISOString();
    const { error: insertError } = await supabase.from("quiz_results").insert({
      user_id: user.id,
      quiz_id: quiz.id,
      total: questions.length,
      answers: {},
      created_at: nowIso,
      expires_at: expiresAt,
    });

    if (insertError) {
      logDbError("[startQuiz] insert quiz_results gagal", insertError);
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
      status: computeAttemptStatus([...createdTimes, nowIso], quiz.maxAttempts, nowMs),
      draftAnswers: {},
    };
  } catch (e) {
    return unexpected("[startQuiz] galat tak terduga", e);
  }
}

export async function saveDraftAnswers(
  quizId: string,
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

    const attempts = await loadAttempts(supabase, user.id, quizId);
    const open = attempts.find((a) => !a.submitted_at);
    if (!open) {
      return { ok: false, error: "Tidak ada percobaan yang sedang berjalan.", attemptClosed: true };
    }

    const nowMs = Date.now();
    const expiresMs = open.expires_at ? new Date(open.expires_at).getTime() : 0;
    if (nowMs > expiresMs + QUIZ_GRACE_MS) {
      return { ok: false, error: "Waktu sudah habis.", attemptClosed: true };
    }

    const { data: questions, error: questionsError } = await supabase
      .from("quiz_questions")
      .select("id, quiz_options(id)")
      .eq("quiz_id", quizId);
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
    return unexpected("[saveDraftAnswers] galat tak terduga", e);
  }
}

export async function submitQuiz(
  quizId: string,
  answers: Record<string, string>
): Promise<SubmitQuizResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Kamu harus login untuk mengerjakan kuis." };

    const quiz = await getQuizById(supabase, quizId);
    if (!quiz) return { ok: false, error: "Kuis tidak ditemukan." };

    const attempts = await loadAttempts(supabase, user.id, quiz.id);
    const open = attempts.find((a) => !a.submitted_at);
    if (!open) {
      return {
        ok: false,
        error: "Tidak ada percobaan yang sedang berjalan. Mulai percobaan baru dari halaman kuis.",
        attemptClosed: true,
      };
    }

    const questions = await loadKeyedQuestions(supabase, quiz.id);
    const createdTimes = attempts.map((a) => a.created_at);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresMs = open.expires_at ? new Date(open.expires_at).getTime() : 0;

    if (nowMs > expiresMs + QUIZ_GRACE_MS) {
      await closeWithDraft(supabase, open, questions, open.expires_at ?? nowIso);
      return {
        ok: false,
        error:
          "Waktu habis dan jawabanmu terlambat dikirim. Jawaban terakhir yang tersimpan sebagai draf sudah dinilai.",
        status: computeAttemptStatus(createdTimes, quiz.maxAttempts, nowMs),
        attemptClosed: true,
      };
    }

    const { score, total, review, stored } = scoreAnswers(questions, answers ?? {});

    const { data: updated, error: updateError } = await supabase
      .from("quiz_results")
      .update({ score, total, answers: stored, submitted_at: nowIso })
      .eq("id", open.id)
      .is("submitted_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) {
      logDbError("[submitQuiz] update quiz_results gagal", updateError);
      return { ok: false, error: "Gagal menyimpan hasil. Coba kirim ulang." };
    }
    if (!updated) {
      const { data: check } = await supabase
        .from("quiz_results")
        .select("id, submitted_at")
        .eq("id", open.id)
        .maybeSingle();
      if (check && !check.submitted_at) {
        console.error(
          "[submitQuiz] update 0 baris padahal percobaan masih terbuka. Kemungkinan RLS tanpa policy UPDATE.",
          { attemptId: open.id }
        );
        return { ok: false, error: "Gagal menyimpan hasil: penulisan ke database ditolak." };
      }
      return { ok: false, error: "Percobaan ini sudah dikirim sebelumnya.", attemptClosed: true };
    }

    const passed = isPassing(score, total);
    let certificate: QuizCertificate | null = null;

    if (passed && quiz.kind === "posttest") {
      const { data: category } = await supabase
        .from("categories")
        .select("code, name")
        .eq("id", quiz.category_id)
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
      status: computeAttemptStatus(createdTimes, quiz.maxAttempts, nowMs),
      certificate,
    };
  } catch (e) {
    return unexpected("[submitQuiz] galat tak terduga", e);
  }
}