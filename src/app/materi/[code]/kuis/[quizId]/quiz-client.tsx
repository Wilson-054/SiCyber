"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MultipleChoiceQuiz, {
  type ChoiceQuestion,
  type ReviewMap,
} from "@/../utils/Quiz/multiple-choice-quiz";
import { shuffle, type AttemptStatus } from "@/../utils/Quiz/quiz";
import type { AnswerMap } from "@/../utils/Quiz/types";
import {
  saveDraftAnswers,
  startQuiz,
  submitQuiz,
  type SubmitQuizSuccess,
} from "./actions";

type Phase = "intro" | "running" | "result";
type SaveState = "idle" | "saving" | "saved" | "error";
type QuizItemQuestion = ChoiceQuestion & { order_index: number };

const DRAFT_DEBOUNCE_MS = 1000;

function shuffleQuestions(questions: QuizItemQuestion[]): QuizItemQuestion[] {
  return shuffle(questions).map((q) => ({
    ...q,
    quiz_options: shuffle(q.quiz_options).map((o, i) => ({ ...o, order_index: i })),
  }));
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

function RegenNote({ status, mounted }: { status: AttemptStatus; mounted: boolean }) {
  if (!mounted || !status.nextRegenAt || status.used === 0) return null;
  return (
    <p className="text-sm text-[#8B949E]">
      Satu percobaan kembali pada{" "}
      <span className="text-[#C9D1D9]">{formatDateTime(status.nextRegenAt)}</span>.
    </p>
  );
}

function AttemptsLeft({ status, mounted }: { status: AttemptStatus; mounted: boolean }) {
  if (status.maxAttempts == null || status.remaining == null) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        Percobaan tersisa: {status.remaining} dari {status.maxAttempts}
      </p>
      <RegenNote status={status} mounted={mounted} />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Menyimpan draf…" : state === "saved" ? "Draf tersimpan" : "Draf belum tersimpan";
  return (
    <p className={`text-xs ${state === "error" ? "text-[#F85149]" : "text-[#8B949E]"}`} aria-live="polite">
      {text}
    </p>
  );
}

export default function QuizClient({
  quizId,
  categoryCode,
  questionCount,
  durationMinutes,
  passMark,
  initialStatus,
  initialHasOpenAttempt,
  alreadyPassed,
  issuesCertificate,
}: {
  quizId: string;
  categoryCode: string;
  questionCount: number;
  durationMinutes: number;
  passMark: number;
  initialStatus: AttemptStatus;
  initialHasOpenAttempt: boolean;
  alreadyPassed: boolean;
  issuesCertificate: boolean;
}) {
  const mounted = useMounted();

  const [phase, setPhase] = useState<Phase>("intro");
  const [status, setStatus] = useState<AttemptStatus>(initialStatus);
  const [hasOpen, setHasOpen] = useState(initialHasOpenAttempt);
  const [passedBefore, setPassedBefore] = useState(alreadyPassed);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);

  const [questions, setQuestions] = useState<QuizItemQuestion[]>([]);
  const [initialAnswers, setInitialAnswers] = useState<AnswerMap>({});
  const [restoredCount, setRestoredCount] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [attemptKey, setAttemptKey] = useState(0);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<SubmitQuizSuccess | null>(null);

  const limited = status.maxAttempts != null;

  const answersRef = useRef<AnswerMap>({});
  const submittingRef = useRef(false);
  const autoRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);

  const clearDraftTimer = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  }, []);

  const flushDraft = useCallback(async () => {
    clearDraftTimer();
    if (submittingRef.current) return;
    const seq = ++saveSeqRef.current;
    setSaveState("saving");
    const res = await saveDraftAnswers(quizId, answersRef.current);
    if (seq !== saveSeqRef.current || submittingRef.current) return;
    if (res.ok) setSaveState("saved");
    else if (res.attemptClosed) setSaveState("idle");
    else setSaveState("error");
  }, [quizId, clearDraftTimer]);

  const scheduleDraft = useCallback(
    (answers: AnswerMap) => {
      answersRef.current = answers;
      if (submittingRef.current) return;
      setSaveState("saving");
      clearDraftTimer();
      draftTimerRef.current = setTimeout(() => void flushDraft(), DRAFT_DEBOUNCE_MS);
    },
    [clearDraftTimer, flushDraft]
  );

  const finalize = useCallback(
    async (answers: AnswerMap, auto: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      clearDraftTimer();
      saveSeqRef.current += 1;
      setLocked(true);
      setError(null);

      const res = await submitQuiz(quizId, answers);

      if (!res.ok) {
        setError(res.error);
        if (res.status) setStatus(res.status);
        if (auto || res.attemptClosed) {
          setFatal(true);
        } else {
          submittingRef.current = false;
          setLocked(false);
        }
        return;
      }

      setStatus(res.status);
      setHasOpen(false);
      if (res.passed) setPassedBefore(true);
      setResult(res);
      setPhase("result");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [quizId, clearDraftTimer]
  );

  useEffect(() => {
    if (phase !== "running" || expiresAtMs == null) return;

    const tick = () => {
      const left = expiresAtMs - (Date.now() + offsetMs);
      setRemainingMs(Math.max(0, left));
      if (left <= 0 && !autoRef.current) {
        autoRef.current = true;
        void finalize(answersRef.current, true);
      }
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phase, expiresAtMs, offsetMs, finalize]);
  useEffect(() => {
    if (phase !== "running") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && draftTimerRef.current) void flushDraft();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearDraftTimer();
    };
  }, [phase, flushDraft, clearDraftTimer]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);

    const res = await startQuiz(quizId);
    setStarting(false);

    if (!res.ok) {
      setError(res.error);
      if (res.status) setStatus(res.status);
      return;
    }

    const draft: AnswerMap = res.draftAnswers ?? {};
    answersRef.current = draft;
    submittingRef.current = false;
    autoRef.current = false;
    saveSeqRef.current += 1;
    clearDraftTimer();

    setQuestions(shuffleQuestions(res.questions));
    setInitialAnswers(draft);
    setRestoredCount(res.resumed ? Object.keys(draft).length : 0);
    setSaveState("idle");
    setExpiresAtMs(new Date(res.expiresAt).getTime());
    setOffsetMs(res.serverNow - Date.now());
    setRemainingMs(null);
    setStatus(res.status);
    setHasOpen(true);
    setLocked(false);
    setFatal(false);
    setResult(null);
    setAttemptKey((k) => k + 1);
    setPhase("running");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToIntro() {
    clearDraftTimer();
    setPhase("intro");
    setResult(null);
    setError(null);
    setFatal(false);
    setLocked(false);
    setHasOpen(false);
    setSaveState("idle");
  }

  const review: ReviewMap | null = useMemo(() => {
    if (!result) return null;
    return Object.fromEntries(
      result.review.map((r) => [
        r.questionId,
        { correctOptionId: r.correctOptionId, explanation: r.explanation },
      ])
    );
  }, [result]);

  if (phase === "intro") {
    const blocked = status.remaining !== null && status.remaining <= 0 && !hasOpen;

    if (blocked) {
      return (
        <div className="rounded-md border border-[#21262D] bg-[#161B22] px-5 py-6">
          <p className="text-base font-medium">Percobaanmu habis</p>
          <div className="mt-2 space-y-2">
            <RegenNote status={status} mounted={mounted} />
            <p className="text-sm leading-relaxed text-[#8B949E]">
              Pakai waktunya untuk membaca ulang materi dan membuka lab lagi.
            </p>
          </div>
          <Link
            href={`/materi/${categoryCode}`}
            className="mt-4 inline-block rounded-md border border-[#21262D] px-4 py-2 text-sm text-[#C9D1D9] hover:border-[#F0883E]/50"
          >
            Kembali ke daftar materi
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {passedBefore && (
          <p className="rounded-md border border-[#238636]/40 bg-[#238636]/10 px-4 py-3 text-sm text-[#3FB950]">
            Kamu sudah lulus
            {issuesCertificate && (
              <>
                {" "}dan sertifikatmu sudah ada di{" "}
                <Link href="/sertifikat" className="underline">
                  Sertifikat Saya
                </Link>
              </>
            )}
            .{" "}
            {limited
              ? "Percobaan tambahan tetap memakai jatah dan tidak mengubah status lulusmu."
              : "Mengulang tidak mengubah status lulusmu."}
          </p>
        )}

        <div className="rounded-md border border-[#21262D] bg-[#161B22] px-5 py-5">
          <h2 className="text-lg font-medium">Sebelum mulai</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#C9D1D9]">
            <li>{questionCount} soal pilihan ganda, ditampilkan dalam satu halaman.</li>
            <li>
              Waktu {durationMinutes} menit. Saat waktu habis, jawaban yang sudah terisi langsung dikirim
              dan soal kosong dihitung salah.
            </li>
            <li>Lulus dengan minimal {passMark} dari {questionCount} jawaban benar (80%).</li>
            <li>
              {limited
                ? "Satu percobaan terpakai begitu kamu menekan Mulai. Menutup tab atau memuat ulang halaman tidak menghentikan waktu dan tidak mengembalikan percobaan."
                : "Kamu bisa mengulang kuis ini tanpa batas. Menutup tab atau memuat ulang halaman tidak menghentikan waktu."}
            </li>
            <li>
              Jawabanmu tersimpan otomatis selama mengerjakan. Kalau tab tertutup, kamu bisa melanjutkan
              dari jawaban terakhir selama waktu belum habis. Kalau waktu habis saat kamu pergi, jawaban
              yang tersimpan itulah yang dinilai.
            </li>
            <li>Jawaban benar dan penjelasannya muncul setelah kamu mengirim.</li>
          </ul>

          <div className="mt-5">
            <AttemptsLeft status={status} mounted={mounted} />
          </div>

          {hasOpen && (
            <p className="mt-4 rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-4 py-3 text-sm text-[#F0883E]">
              Kamu punya percobaan yang masih berjalan. Melanjutkan tidak memakai percobaan baru dan
              jawaban terakhirmu dipulihkan, tapi waktunya tidak berhenti.
            </p>
          )}

          {error && <p className="mt-4 text-sm text-[#F85149]">{error}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={start}
              disabled={starting}
              className="rounded-md bg-[#F0883E] px-6 py-2 text-sm font-medium text-[#0D1117] transition hover:bg-[#F0883E]/90 disabled:opacity-60"
            >
              {starting ? "Menyiapkan…" : hasOpen ? "Lanjutkan percobaan" : "Mulai kuis"}
            </button>
            <Link
              href={`/materi/${categoryCode}`}
              className="rounded-md border border-[#21262D] px-5 py-2 text-sm text-[#C9D1D9] hover:border-[#F0883E]/50"
            >
              Kembali
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const lowTime = remainingMs != null && remainingMs <= 5 * 60 * 1000;

  return (
    <div>
      {phase === "running" && (
        <div className="sticky top-0 z-10 -mx-6 mb-6 border-b border-[#21262D] bg-[#0D1117]/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[#8B949E]">
                {locked && remainingMs === 0 ? "Waktu habis. Mengirim jawabanmu…" : "Sisa waktu"}
              </p>
              <SaveIndicator state={saveState} />
            </div>
            <p
              role="timer"
              className={`font-mono text-xl font-semibold tabular-nums ${
                lowTime ? "text-[#F85149]" : "text-[#E6EDF3]"
              }`}
            >
              {remainingMs == null ? "--:--" : formatClock(remainingMs)}
            </p>
          </div>
        </div>
      )}

      {phase === "running" && restoredCount > 0 && (
        <p className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] px-4 py-3 text-sm text-[#C9D1D9]">
          {restoredCount} jawaban terakhirmu dipulihkan. Urutan soal dan pilihan diacak ulang.
        </p>
      )}

      {fatal && (
        <div className="mb-6 rounded-md border border-[#F85149]/40 bg-[#F85149]/10 px-5 py-4">
          <p className="text-sm text-[#F85149]">{error}</p>
          <button
            type="button"
            onClick={backToIntro}
            className="mt-3 rounded-md border border-[#21262D] px-4 py-2 text-sm text-[#C9D1D9] hover:border-[#F0883E]/50"
          >
            Kembali ke awal
          </button>
        </div>
      )}

      {phase === "result" && result && (
        <div
          className={`mb-8 rounded-md border px-6 py-5 ${
            result.passed
              ? "border-[#238636]/40 bg-[#238636]/10"
              : "border-[#F85149]/40 bg-[#F85149]/10"
          }`}
        >
          <p className={`text-2xl font-semibold ${result.passed ? "text-[#3FB950]" : "text-[#F85149]"}`}>
            {result.score} dari {result.total} benar
          </p>
          <p className="mt-1 text-sm text-[#C9D1D9]">
            {result.passed
              ? "Lulus. Kamu menjawab di atas batas 80%."
              : `Belum lulus. Kamu butuh minimal ${passMark} jawaban benar.`}
          </p>
          {result.timedOut && (
            <p className="mt-2 text-sm text-[#8B949E]">
              Waktu habis. Jawaban yang sudah terisi dikirim otomatis dan soal kosong dihitung salah.
            </p>
          )}

          {result.certificate && (
            <div className="mt-4 rounded-md border border-[#3FB950]/40 bg-[#0D1117]/60 px-4 py-3">
              <p className="text-sm font-medium text-[#3FB950]">
                {result.certificate.newlyEarned
                  ? `Sertifikat ${result.certificate.code} didapat`
                  : `Sertifikat ${result.certificate.code} sudah kamu miliki`}
              </p>
              <p className="mt-1 text-sm text-[#C9D1D9]">{result.certificate.name}</p>
              <Link
                href="/sertifikat"
                className="mt-3 inline-block rounded-md bg-[#F0883E] px-4 py-1.5 text-xs font-medium text-[#0D1117] hover:bg-[#F0883E]/90"
              >
                Lihat sertifikat
              </Link>
            </div>
          )}

          <div className="mt-4 text-[#8B949E]">
            <AttemptsLeft status={result.status} mounted={mounted} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/materi/${categoryCode}`}
              className="rounded-md bg-[#F0883E] px-5 py-2 text-sm font-medium text-[#0D1117] hover:bg-[#F0883E]/90"
            >
              Kembali ke daftar materi
            </Link>
            {(result.status.remaining === null || result.status.remaining > 0) && (
              <button
                type="button"
                onClick={backToIntro}
                className="rounded-md border border-[#21262D] px-5 py-2 text-sm text-[#C9D1D9] hover:border-[#F0883E]/50"
              >
                {result.passed ? "Coba lagi untuk latihan" : "Siapkan percobaan berikutnya"}
              </button>
            )}
          </div>
        </div>
      )}

      <MultipleChoiceQuiz
        key={attemptKey}
        layout="list"
        accent="orange"
        questions={questions}
        initialAnswers={initialAnswers}
        onAnswersChange={scheduleDraft}
        onFinish={(answers) => finalize(answers, false)}
        finishLabel="Kirim jawaban"
        locked={locked}
        errorMessage={fatal ? null : error}
        review={review}
      />
    </div>
  );
}