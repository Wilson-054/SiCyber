'use client'

// Save as: utils/Quiz/multiple-choice-quiz.tsx (MENGGANTIKAN versi lama)
//
// Modul pilihan ganda universal. Tetap TIDAK tahu soal Supabase, penilaian,
// atau routing: ia menampilkan soal, mengumpulkan jawaban, lalu memanggil
// onFinish(answers).
//
// Dua layout:
//   layout="wizard" (default) : satu soal per layar. Perilaku lama, dipakai
//                               onboarding. TIDAK berubah.
//   layout="list"             : semua soal dalam satu halaman, tombol kirim
//                               aktif setelah semua soal terjawab.
//
// Mode review (hanya layout list): beri prop `review` setelah jawaban
// dinilai oleh pemanggil. Pilihan dikunci, jawaban benar/salah ditandai, dan
// penjelasan ditampilkan di bawah tiap soal. Kunci jawaban datang dari
// pemanggil, komponen ini tidak pernah menghitung benar/salah sendiri.
//
// Komponen ini generik: soal cukup punya id, question_text, dan quiz_options
// (id, option_text, order_index). QuizQuestion lama otomatis cocok.

import { useState } from 'react'
import type { AnswerMap, QuizQuestion } from './types'

type Accent = 'teal' | 'orange'
type Layout = 'wizard' | 'list'

export interface ChoiceQuestion {
  id: string
  question_text: string
  quiz_options: { id: string; option_text: string; order_index: number }[]
}

export interface ChoiceReview {
  correctOptionId: string
  explanation?: string | null
}

/** questionId -> kunci + penjelasan. Diisi pemanggil setelah penilaian. */
export type ReviewMap = Record<string, ChoiceReview>

// Kelas Tailwind harus ditulis utuh (tidak boleh dirakit dari string)
// supaya terdeteksi saat build.
const THEMES: Record<
  Accent,
  {
    meta: string
    track: string
    bar: string
    card: string
    title: string
    option: string
    optionSelected: string
    optionCorrect: string
    optionWrong: string
    optionDim: string
    explain: string
    primary: string
    ghost: string
    error: string
  }
> = {
  // Gaya halaman onboarding (slate + teal)
  teal: {
    meta: 'text-slate-500',
    track: 'bg-slate-800',
    bar: 'bg-teal-500',
    card: 'border-slate-800 bg-slate-900',
    title: 'text-slate-100',
    option: 'border-slate-700 text-slate-300 hover:border-slate-600',
    optionSelected: 'border-teal-500 bg-teal-500/10 text-teal-200',
    optionCorrect: 'border-emerald-500 bg-emerald-500/10 text-emerald-300',
    optionWrong: 'border-red-500 bg-red-500/10 text-red-300',
    optionDim: 'border-slate-800 text-slate-500',
    explain: 'border-slate-700 bg-slate-950/60 text-slate-300',
    primary: 'bg-teal-500 text-slate-950 hover:bg-teal-400',
    ghost: 'text-slate-400',
    error: 'text-red-400',
  },
  // Gaya halaman materi (GitHub dark + oranye)
  orange: {
    meta: 'text-[#8B949E]',
    track: 'bg-[#21262D]',
    bar: 'bg-[#F0883E]',
    card: 'border-[#21262D] bg-[#0D1117]',
    title: 'text-[#E6EDF3]',
    option: 'border-[#21262D] text-[#C9D1D9] hover:border-[#8B949E]',
    optionSelected: 'border-[#F0883E] bg-[#F0883E]/10 text-[#F0883E]',
    optionCorrect: 'border-[#3FB950] bg-[#3FB950]/10 text-[#3FB950]',
    optionWrong: 'border-[#F85149] bg-[#F85149]/10 text-[#F85149]',
    optionDim: 'border-[#21262D] text-[#8B949E]',
    explain: 'border-[#21262D] bg-[#161B22] text-[#C9D1D9]',
    primary: 'bg-[#F0883E] text-[#0D1117] hover:bg-[#F0883E]/90',
    ghost: 'text-[#8B949E]',
    error: 'text-[#F85149]',
  },
}

export interface MultipleChoiceQuizProps<Q extends ChoiceQuestion = QuizQuestion> {
  /** Soal sudah terurut (dan sudah diacak/dipilih bila perlu) oleh pemanggil. */
  questions: Q[]
  /** Dipanggil sekali saat user menekan tombol kirim / tombol di soal terakhir. */
  onFinish: (answers: AnswerMap) => void | Promise<void>
  accent?: Accent
  /** Default 'wizard'. */
  layout?: Layout
  /** Label tombol akhir. Default: "Selesai" (wizard) / "Kirim jawaban" (list). */
  finishLabel?: string
  /** [wizard] Label teks kecil di kanan atas, mis. "minat topik". Opsional. */
  questionTag?: (question: Q) => string | null
  /** [wizard] Boleh kembali ke soal sebelumnya? Default: true. */
  allowBack?: boolean
  /** Jawaban awal (mis. untuk melanjutkan sesi). */
  initialAnswers?: AnswerMap
  /** Pesan galat dari pemanggil, ditampilkan di bawah tombol. */
  errorMessage?: string | null
  /** [list] Kunci + penjelasan per soal. Bila ada, kuis masuk mode review. */
  review?: ReviewMap | null
  /** [list] Dipanggil setiap jawaban berubah; dipakai pemanggil untuk auto-submit (mis. waktu habis). */
  onAnswersChange?: (answers: AnswerMap) => void
  /** [list] Kunci pilihan dari luar (mis. waktu habis atau sedang mengirim). */
  locked?: boolean
}

export default function MultipleChoiceQuiz<Q extends ChoiceQuestion = QuizQuestion>(
  props: MultipleChoiceQuizProps<Q>
) {
  return props.layout === 'list' ? <QuizList {...props} /> : <QuizWizard {...props} />
}

// ===========================================================================
// Layout wizard (perilaku lama, tidak diubah)
// ===========================================================================

function QuizWizard<Q extends ChoiceQuestion>({
  questions,
  onFinish,
  accent = 'teal',
  finishLabel = 'Selesai',
  questionTag,
  allowBack = true,
  initialAnswers,
  errorMessage,
}: MultipleChoiceQuizProps<Q>) {
  const t = THEMES[accent]
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers ?? {})
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  if (questions.length === 0) {
    return (
      <div className={`rounded-2xl border p-8 text-center text-sm ${t.card} ${t.meta}`}>
        Belum ada soal yang tersedia.
      </div>
    )
  }

  const total = questions.length
  const question = questions[stepIndex]
  const isLast = stepIndex === total - 1
  const answered = Boolean(answers[question.id])
  const progressPct = ((stepIndex + 1) / total) * 100
  const tag = questionTag?.(question) ?? null
  const options = [...question.quiz_options].sort((a, b) => a.order_index - b.order_index)

  function select(optionId: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }))
  }

  async function next() {
    if (!answered || submitting) return
    if (!isLast) {
      setStepIndex((i) => i + 1)
      return
    }
    setSubmitting(true)
    try {
      await onFinish(answers)
    } finally {
      // Kalau pemanggil pindah halaman, komponen ini sudah unmount dan
      // setState diabaikan; kalau gagal, tombol aktif lagi untuk coba ulang.
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className={`mb-4 flex items-center justify-between font-mono text-xs ${t.meta}`}>
        <span>
          Q {String(stepIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        {tag && <span>{tag}</span>}
      </div>

      <div
        className={`mb-6 h-1.5 w-full rounded-full ${t.track}`}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={stepIndex + 1}
      >
        <div
          className={`h-1.5 rounded-full transition-all ${t.bar}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className={`rounded-2xl border p-8 ${t.card}`}>
        <h2 className={`text-lg font-medium ${t.title}`}>{question.question_text}</h2>

        <div className="mt-6 space-y-3" role="radiogroup" aria-label={question.question_text}>
          {options.map((opt) => {
            const selected = answers[question.id] === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => select(opt.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                  selected ? t.optionSelected : t.option
                }`}
              >
                {opt.option_text}
              </button>
            )
          })}
        </div>

        {errorMessage && <p className={`mt-4 text-sm ${t.error}`}>{errorMessage}</p>}

        <div className="mt-8 flex justify-between">
          {allowBack ? (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0 || submitting}
              className={`rounded-lg px-4 py-2 text-sm disabled:opacity-30 ${t.ghost}`}
            >
              Kembali
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={next}
            disabled={!answered || submitting}
            className={`rounded-lg px-6 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${t.primary}`}
          >
            {isLast ? (submitting ? 'Menyimpan…' : finishLabel) : 'Lanjut'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// Layout list: semua soal satu halaman, dengan mode review
// ===========================================================================

function QuizList<Q extends ChoiceQuestion>({
  questions,
  onFinish,
  accent = 'orange',
  finishLabel = 'Kirim jawaban',
  initialAnswers,
  errorMessage,
  review,
  onAnswersChange,
  locked: lockedProp,
}: MultipleChoiceQuizProps<Q>) {
  const t = THEMES[accent]
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers ?? {})
  const [submitting, setSubmitting] = useState(false)

  if (questions.length === 0) {
    return (
      <div className={`rounded-lg border p-8 text-center text-sm ${t.card} ${t.meta}`}>
        Belum ada soal yang tersedia.
      </div>
    )
  }

  const total = questions.length
  const answeredCount = questions.filter((q) => answers[q.id]).length
  const allAnswered = answeredCount === total
  const reviewing = Boolean(review)
  const locked = reviewing || submitting || Boolean(lockedProp)

  function select(questionId: string, optionId: string) {
    if (locked) return
    const next = { ...answers, [questionId]: optionId }
    setAnswers(next)
    onAnswersChange?.(next)
  }

  async function submit() {
    if (!allAnswered || locked) return
    setSubmitting(true)
    try {
      await onFinish(answers)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <ol className="space-y-6">
        {questions.map((question, qi) => {
          const options = [...question.quiz_options].sort((a, b) => a.order_index - b.order_index)
          const r = review?.[question.id]
          const chosenId = answers[question.id]
          const isCorrect = r ? chosenId === r.correctOptionId : false

          return (
            <li key={question.id} className={`rounded-lg border p-6 ${t.card}`}>
              <div className="flex gap-4">
                <span className={`pt-0.5 font-mono text-sm ${t.meta}`}>{qi + 1}.</span>
                <div className="min-w-0 flex-1">
                  <h2 className={`text-base font-medium leading-relaxed ${t.title}`}>
                    {question.question_text}
                  </h2>

                  <div
                    className="mt-4 space-y-2"
                    role="radiogroup"
                    aria-label={question.question_text}
                  >
                    {options.map((opt) => {
                      const selected = chosenId === opt.id
                      let cls: string
                      let marker: string | null = null

                      if (r) {
                        if (opt.id === r.correctOptionId) {
                          cls = t.optionCorrect
                          marker = 'Jawaban benar'
                        } else if (selected) {
                          cls = t.optionWrong
                          marker = 'Jawabanmu'
                        } else {
                          cls = t.optionDim
                        }
                      } else {
                        cls = selected ? t.optionSelected : t.option
                      }

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={locked}
                          onClick={() => select(question.id, opt.id)}
                          className={`w-full rounded-md border px-4 py-3 text-left text-sm leading-relaxed transition disabled:cursor-default ${cls}`}
                        >
                          <span className="block">{opt.option_text}</span>
                          {marker && (
                            <span className="mt-1 block text-xs font-medium">{marker}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {r && (
                    <div className={`mt-4 rounded-md border px-4 py-3 text-sm leading-relaxed ${t.explain}`}>
                      <p className="font-medium">{isCorrect ? 'Benar.' : 'Belum tepat.'}</p>
                      {r.explanation && <p className="mt-1">{r.explanation}</p>}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {!reviewing && (
        <div
          className={`sticky bottom-4 mt-8 flex items-center justify-between gap-4 rounded-lg border px-5 py-3 ${t.card}`}
        >
          <div className="flex-1">
            <p className={`text-xs ${t.meta}`}>
              Terjawab {answeredCount} dari {total}
            </p>
            <div
              className={`mt-2 h-1.5 w-full rounded-full ${t.track}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answeredCount}
            >
              <div
                className={`h-1.5 rounded-full transition-all ${t.bar}`}
                style={{ width: `${(answeredCount / total) * 100}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered || locked}
            className={`rounded-md px-6 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${t.primary}`}
          >
            {submitting ? 'Menilai…' : finishLabel}
          </button>
        </div>
      )}

      {errorMessage && !reviewing && (
        <p className={`mt-4 text-sm ${t.error}`}>{errorMessage}</p>
      )}
    </div>
  )
}