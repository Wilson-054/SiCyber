'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/../utils/supabase/client'
import { scoreInterest } from '@/../utils/Quiz/scoring'
import MultipleChoiceQuiz from '@/../utils/Quiz/multiple-choice-quiz'
import type {
  AnswerMap,
  Category,
  InterestResult,
  QuizQuestion,
} from '@/../utils/Quiz/types'

type Stage = 'loading' | 'quiz' | 'result' | 'error'

export default function OnboardingQuiz() {
  const router = useRouter()
  const supabase = createClient()

  const [stage, setStage] = useState<Stage>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [answers, setAnswers] = useState<AnswerMap>({})
  const [result, setResult] = useState<InterestResult | null>(null)
  const [saving, setSaving] = useState(false)

  // ---- Load soal minat + kategori -------------------------------------
  useEffect(() => {
    async function load() {
      const [{ data: qData, error: qError }, { data: cData, error: cError }] =
        await Promise.all([
          supabase
            .from('quiz_questions')
            .select('id, kind, question_text, category_id, order_index, quiz_options(*)')
            .eq('kind', 'interest')
            .order('order_index', { ascending: true }),
          supabase.from('categories').select('*').order('order_index', { ascending: true }),
        ])

      if (qError || cError || !qData || !cData || qData.length === 0) {
        setErrorMsg('Gagal memuat kuis onboarding. Coba muat ulang halaman.')
        setStage('error')
        return
      }

      setQuestions(qData as QuizQuestion[])
      setCategories(cData as Category[])
      setStage('quiz')
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  function handleFinish(finalAnswers: AnswerMap) {
    setAnswers(finalAnswers)
    setResult(scoreInterest(questions, categories, finalAnswers))
    setStage('result')
  }

  // ---- Simpan satu baris quiz_results per kategori ---------------------
  async function confirmAndStart() {
    if (!result) return
    setSaving(true)
    setErrorMsg('')

    const { data: userRes } = await supabase.auth.getUser()
    const userId = userRes.user?.id

    if (!userId) {
      setErrorMsg('Kamu harus login terlebih dahulu untuk menyimpan hasil onboarding.')
      setSaving(false)
      return
    }

    // Satu sesi pengerjaan = satu attempt_id (banyak baris, satu per kategori)
    const attemptId = crypto.randomUUID()

    const rows = result.categoryScores.map(({ category, score, total }) => {
      const categoryAnswers: AnswerMap = {}
      for (const q of questions) {
        if (q.category_id === category.id && answers[q.id]) {
          categoryAnswers[q.id] = answers[q.id]
        }
      }
      return {
        user_id: userId,
        category_id: category.id,
        kind: 'interest',
        attempt_id: attemptId,
        score,
        total,
        answers: categoryAnswers,
      }
    })

    const { error } = await supabase.from('quiz_results').insert(rows)
    setSaving(false)

    if (error) {
      setErrorMsg('Gagal menyimpan hasil onboarding. Coba lagi.')
      return
    }

    const code = result.recommendedCategory?.code ?? 'A01'
    router.push(`/materi/${code}`)
  }

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

  if (stage === 'result' && result) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-teal-400">
            Hasil Onboarding
          </p>

          {result.recommendedCategory ? (
            <h2 className="mt-2 text-2xl font-semibold text-slate-100">
              Kami sarankan mulai dari{' '}
              <span className="text-teal-400">{result.recommendedCategory.name}</span>{' '}
              <span className="text-slate-500">({result.recommendedCategory.code})</span>
            </h2>
          ) : (
            <h2 className="mt-2 text-2xl font-semibold text-slate-100">
              Terima kasih sudah mengisi onboarding
            </h2>
          )}

          <div className="mt-6 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Minat per kategori</p>
            {result.categoryScores.map(({ category, score, total }) => {
              const pct = total > 0 ? Math.round((score / total) * 100) : 0
              return (
                <div key={category.id}>
                  <div className="mb-1 flex justify-between text-xs text-slate-400">
                    <span>{category.name}</span>
                    <span>
                      {score}/{total}
                    </span>
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

  return (
    <div className="mx-auto max-w-xl">
      <MultipleChoiceQuiz
        questions={questions}
        onFinish={handleFinish}
        accent="teal"
        finishLabel="Lihat Rekomendasi"
        questionTag={(q) => categoryName.get(q.category_id) ?? null}
      />
    </div>
  )
}