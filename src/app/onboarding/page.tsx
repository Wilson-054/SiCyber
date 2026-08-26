'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/../utils/supabase/client'
import { scoreOnboarding } from '@/../utils/Quiz/scoring'
import type {
  AnswerMap,
  Category,
  OnboardingQuestion,
  OnboardingRecommendation,
} from '@/../utils/Quiz/types'

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Pemula',
  intermediate: 'Menengah',
  advanced: 'Lanjutan',
}

type Stage = 'loading' | 'quiz' | 'result' | 'error'

export default function OnboardingQuiz() {
  const router = useRouter()
  const supabase = createClient()

  const [stage, setStage] = useState<Stage>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [stepIndex, setStepIndex] = useState(0)
  const [recommendation, setRecommendation] = useState<OnboardingRecommendation | null>(null)
  const [saving, setSaving] = useState(false)

  // ---- Load questions + options + categories -------------------------
  useEffect(() => {
    async function load() {
      const [{ data: qData, error: qError }, { data: cData, error: cError }] = await Promise.all([
        supabase
          .from('onboarding_questions')
          .select('id, question_text, category_id, order_index, onboarding_options(*)')
          .order('order_index', { ascending: true }),
        supabase.from('categories').select('*').order('order_index', { ascending: true }),
      ])

      if (qError || cError || !qData || !cData) {
        setErrorMsg('Gagal memuat kuis onboarding. Coba muat ulang halaman.')
        setStage('error')
        return
      }

      const sortedQuestions = (qData as OnboardingQuestion[]).map((q) => ({
        ...q,
        onboarding_options: [...q.onboarding_options].sort(
          (a, b) => a.order_index - b.order_index
        ),
      }))

      setQuestions(sortedQuestions)
      setCategories(cData as Category[])
      setStage('quiz')
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentQuestion = questions[stepIndex]
  const isLastQuestion = stepIndex === questions.length - 1
  const answeredCurrent = currentQuestion ? Boolean(answers[currentQuestion.id]) : false
  const progressPct = questions.length ? ((stepIndex + 1) / questions.length) * 100 : 0

  function selectOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  function goNext() {
    if (isLastQuestion) {
      const result = scoreOnboarding(questions, categories, answers)
      setRecommendation(result)
      setStage('result')
    } else {
      setStepIndex((i) => i + 1)
    }
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  async function confirmAndStart() {
    if (!recommendation) return
    setSaving(true)

    const { data: userRes } = await supabase.auth.getUser()
    const userId = userRes.user?.id

    if (!userId) {
      setErrorMsg('Kamu harus login terlebih dahulu untuk menyimpan hasil onboarding.')
      setStage('error')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('user_onboarding_result').upsert(
      {
        user_id: userId,
        total_score: recommendation.totalScore,
        determined_level: recommendation.determinedLevel,
          category_scores: recommendation.categoryScores,
        raw_answers: answers,
      },
      { onConflict: 'user_id' }
    )

    setSaving(false)

    if (error) {
      setErrorMsg('Gagal menyimpan hasil onboarding. Coba lagi.')
      setStage('error')
      return
    }

    const code = recommendation.recommendedCategory?.code ?? 'A01'
    router.push(`/materi/${code}?level=${recommendation.determinedLevel}`)
  }

  const totalQuestions = useMemo(() => questions.length, [questions])

  if (stage === 'loading') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
        <p className="font-mono text-sm text-slate-400">memuat kuis onboarding…</p>
      </div>
    )
  }

  if (stage === 'error') {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
        <p className="text-red-300">{errorMsg}</p>
      </div>
    )
  }

  if (stage === 'result' && recommendation) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-teal-400">
            Hasil Onboarding
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-100">
            Kamu direkomendasikan mulai dari tingkat{' '}
            <span className="text-teal-400">{LEVEL_LABEL[recommendation.determinedLevel]}</span>
          </h2>

          {recommendation.recommendedCategory && (
            <p className="mt-3 text-slate-400">
              Materi pertama yang kami sarankan:{' '}
              <span className="font-medium text-slate-200">
                {recommendation.recommendedCategory.name}
              </span>{' '}
              ({recommendation.recommendedCategory.code})
            </p>
          )}

          <div className="mt-6 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Minat per kategori</p>
            {recommendation.categoryScores.map(({ category, score }) => {
              const maxScore = 3 // highest option value per category question
              const pct = Math.round((score / maxScore) * 100)
              return (
                <div key={category.id}>
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>{category.name}</span>
                    <span>{score}/3</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800">
                    <div
                      className="h-1.5 rounded-full bg-teal-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {errorMsg && <p className="mt-4 text-sm text-red-400">{errorMsg}</p>}

          <button
            onClick={confirmAndStart}
            disabled={saving}
            className="mt-8 w-full rounded-lg bg-teal-500 py-3 font-medium text-slate-950 transition hover:bg-teal-400 disabled:opacity-60"
          >
            {saving ? 'Menyimpan…' : 'Mulai Belajar'}
          </button>
        </div>
      </div>
    )
  }

  if (!currentQuestion) return null

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between font-mono text-xs text-slate-500">
        <span>
          Q {String(stepIndex + 1).padStart(2, '0')} / {String(totalQuestions).padStart(2, '0')}
        </span>
        <span>{currentQuestion.category_id ? 'minat topik' : 'kemampuan umum'}</span>
      </div>

      <div className="mb-6 h-1.5 w-full rounded-full bg-slate-800">
        <div
          className="h-1.5 rounded-full bg-teal-500 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h2 className="text-lg font-medium text-slate-100">{currentQuestion.question_text}</h2>

        <div className="mt-6 space-y-3">
          {currentQuestion.onboarding_options.map((opt) => {
            const selected = answers[currentQuestion.id] === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => selectOption(currentQuestion.id, opt.id)}
                className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                  selected
                    ? 'border-teal-500 bg-teal-500/10 text-teal-200'
                    : 'border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                {opt.option_text}
              </button>
            )
          })}
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={goBack}
            disabled={stepIndex === 0}
            className="rounded-lg px-4 py-2 text-sm text-slate-400 disabled:opacity-30"
          >
            Kembali
          </button>
          <button
            onClick={goNext}
            disabled={!answeredCurrent}
            className="rounded-lg bg-teal-500 px-6 py-2 text-sm font-medium text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isLastQuestion ? 'Lihat Rekomendasi' : 'Lanjut'}
          </button>
        </div>
      </div>
    </div>
  )
}