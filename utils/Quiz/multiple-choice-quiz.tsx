'use client'

import { useState } from 'react'
import type { AnswerMap, QuizQuestion } from './types'

/**
 * Modul pilihan ganda universal.
 *
 * Dipakai untuk onboarding (minat), pre-test, dan post-test. Modul ini
 * SENGAJA tidak tahu apa-apa soal Supabase, penilaian, atau routing:
 * ia hanya menampilkan soal satu per satu, mengumpulkan jawaban, lalu
 * memanggil onFinish(answers). Pemuatan soal dan penyimpanan hasil
 * jadi tanggung jawab pemanggil.
 *
 *   <MultipleChoiceQuiz
 *     key={attemptKey}              // ganti key untuk mengulang dari awal
 *     questions={questions}
 *     onFinish={(answers) => save(answers)}
 *   />
 */

type Accent = 'teal' | 'orange'

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
    primary: 'bg-[#F0883E] text-[#0D1117] hover:bg-[#F0883E]/90',
    ghost: 'text-[#8B949E]',
    error: 'text-[#F85149]',
  },
}

export interface MultipleChoiceQuizProps {
  /** Soal sudah terurut (dan sudah diacak/dipilih bila perlu) oleh pemanggil. */
  questions: QuizQuestion[]
  /** Dipanggil sekali saat user menekan tombol di soal terakhir. */
  onFinish: (answers: AnswerMap) => void | Promise<void>
  accent?: Accent
  /** Label tombol di soal terakhir. Default: "Selesai". */
  finishLabel?: string
  /** Label teks kecil di kanan atas, mis. "minat topik". Opsional. */
  questionTag?: (question: QuizQuestion) => string | null
  /** Boleh kembali ke soal sebelumnya? Default: true. */
  allowBack?: boolean
  /** Jawaban awal (mis. untuk melanjutkan sesi). */
  initialAnswers?: AnswerMap
  /** Pesan galat dari pemanggil, ditampilkan di bawah tombol. */
  errorMessage?: string | null
}

export default function MultipleChoiceQuiz({
  questions,
  onFinish,
  accent = 'teal',
  finishLabel = 'Selesai',
  questionTag,
  allowBack = true,
  initialAnswers,
  errorMessage,
}: MultipleChoiceQuizProps) {
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
  const options = [...question.quiz_options].sort(
    (a, b) => a.order_index - b.order_index
  )

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