
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

type InterestQuizRow = {
  id: string
  category_id: string
  quiz_questions: {
    id: string
    question_text: string
    order_index: number | null
    quiz_options: unknown[]
  }[]
}

export default function OnboardingQuiz() {
  const router = useRouter()
  const supabase = createClient()

  const [stage, setStage] = useState<Stage>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  // category_id -> quizzes.id (kuis minat milik kategori tersebut)
  const [quizIdByCategory, setQuizIdByCategory] = useState<
    Map<string, string>
  >(new Map())

  const [answers, setAnswers] = useState<AnswerMap>({})
  const [result, setResult] = useState<InterestResult | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [
          { data: qData, error: qError },
          { data: cData, error: cError },
        ] = await Promise.all([
          supabase
            .from('quizzes')
            .select(
              'id, category_id, quiz_questions(id, question_text, order_index, quiz_options(*))'
            )
            .eq('kind', 'interest'),
          supabase
            .from('categories')
            .select('*')
            .order('order_index', { ascending: true }),
        ])

        if (cancelled) return

        if (qError || cError || !qData || !cData) {
          console.error('[onboarding] gagal memuat data', {
            quizError: qError,
            categoryError: cError,
          })

          setErrorMsg(
            'Gagal memuat kuis onboarding. Coba muat ulang halaman.'
          )
          setStage('error')
          return
        }

        const cats = cData as Category[]
        const catOrder = new Map(
          cats.map((category, index) => [category.id, index])
        )

        const quizMap = new Map<string, string>()
        const flat: QuizQuestion[] = []

        for (const quiz of qData as unknown as InterestQuizRow[]) {
          if (!quiz.quiz_questions?.length) continue

          quizMap.set(quiz.category_id, quiz.id)

          for (const question of quiz.quiz_questions) {
            // Mempertahankan bentuk lama agar scoring.ts dan types.ts
            // tidak perlu diubah.
            flat.push({
              id: question.id,
              kind: 'interest',
              question_text: question.question_text,
              category_id: quiz.category_id,
              order_index: question.order_index ?? 0,
              quiz_options: question.quiz_options,
            } as unknown as QuizQuestion)
          }
        }

        flat.sort(
          (a, b) =>
            a.order_index - b.order_index ||
            (catOrder.get(a.category_id) ?? 0) -
              (catOrder.get(b.category_id) ?? 0)
        )

        if (flat.length === 0) {
          console.error(
            '[onboarding] tidak ada pertanyaan kuis minat yang ditemukan'
          )

          setErrorMsg(
            'Gagal memuat kuis onboarding. Coba muat ulang halaman.'
          )
          setStage('error')
          return
        }

        setQuestions(flat)
        setCategories(cats)
        setQuizIdByCategory(quizMap)
        setStage('quiz')
      } catch (error) {
        if (cancelled) return

        console.error('[onboarding] exception saat memuat kuis', error)

        setErrorMsg(
          'Terjadi kesalahan saat memuat kuis onboarding. Coba muat ulang halaman.'
        )
        setStage('error')
      }
    }

    void load()

    return () => {
      cancelled = true
    }

  }, [])

  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  function handleFinish(finalAnswers: AnswerMap) {
    setAnswers(finalAnswers)
    setResult(scoreInterest(questions, categories, finalAnswers))
    setStage('result')
  }

  async function confirmAndStart() {
    if (!result || saving) return

    setSaving(true)
    setErrorMsg('')

    try {
      const { data: userRes, error: userError } =
        await supabase.auth.getUser()

      if (userError) {
        console.error(
          '[onboarding] gagal memeriksa autentikasi user',
          userError
        )

        setErrorMsg(
          'Gagal memverifikasi sesi login. Silakan login kembali dan coba lagi.'
        )
        return
      }

      const userId = userRes.user?.id

      if (!userId) {
        setErrorMsg(
          'Kamu harus login terlebih dahulu untuk menyimpan hasil onboarding.'
        )
        return
      }

      const nowIso = new Date().toISOString()

      const rows = result.categoryScores.flatMap(
        ({ category, score, total }) => {
          const quizId = quizIdByCategory.get(category.id)

          // Kategori tanpa kuis minat tidak dapat disimpan.
          if (!quizId) return []

          const categoryAnswers: AnswerMap = {}

          for (const question of questions) {
            if (
              question.category_id === category.id &&
              answers[question.id]
            ) {
              categoryAnswers[question.id] = answers[question.id]
            }
          }

          return [
            {
              user_id: userId,
              quiz_id: quizId,
              score,
              total,
              answers: categoryAnswers,
              submitted_at: nowIso,
            },
          ]
        }
      )

      if (rows.length === 0) {
        console.error('[onboarding] rows kosong', {
          quizIdByCategory: [...quizIdByCategory.entries()],
          categoryScores: result.categoryScores.map(
            ({ category, score, total }) => ({
              categoryId: category.id,
              categoryName: category.name,
              score,
              total,
              quizId: quizIdByCategory.get(category.id) ?? null,
            })
          ),
        })

        setErrorMsg(
          'Tidak ada baris yang bisa disimpan: kuis minat tidak ditemukan untuk kategori hasil.'
        )
        return
      }

      const { error: insertError } = await supabase
        .from('quiz_results')
        .insert(rows)

      if (insertError) {
        console.error(
          '[onboarding] insert quiz_results gagal',
          insertError
        )

        setErrorMsg(
          `Gagal menyimpan: ${insertError.code || 'UNKNOWN'} ${insertError.message}`
        )
        return
      }

      const code = result.recommendedCategory?.code ?? 'A01'
      router.push(`/materi/${code}`)
    } catch (error) {
      console.error(
        '[onboarding] exception saat menyimpan hasil onboarding',
        error
      )

      setErrorMsg(
        'Terjadi kesalahan yang tidak terduga saat menyimpan hasil onboarding. Coba lagi.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (stage === 'loading') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
        <p className="font-mono text-sm text-slate-400">
          memuat kuis onboarding…
        </p>
      </div>
    )
  }

  if (stage === 'error') {
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center"
      >
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
              <span className="text-teal-400">
                {result.recommendedCategory.name}
              </span>{' '}
              <span className="text-slate-500">
                ({result.recommendedCategory.code})
              </span>
            </h2>
          ) : (
            <h2 className="mt-2 text-2xl font-semibold text-slate-100">
              Terima kasih sudah mengisi onboarding
            </h2>
          )}

          <div className="mt-6 space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Minat per kategori
            </p>

            {result.categoryScores.map(({ category, score, total }) => {
              const pct =
                total > 0 ? Math.round((score / total) * 100) : 0

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

          {errorMsg && (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {errorMsg}
            </p>
          )}

          <button
            type="button"
            onClick={confirmAndStart}
            disabled={saving}
            className="mt-8 w-full rounded-lg bg-teal-500 py-3 font-medium text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
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
        questionTag={(question) =>
          categoryName.get(question.category_id) ?? null
        }
      />
    </div>
  )
}
