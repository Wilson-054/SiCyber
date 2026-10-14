import type {
  AnswerMap,
  Category,
  InterestResult,
  KnowledgeResult,
  Level,
  QuizQuestion,
} from './types'

/**
 * Aturan nilai (satu bank soal, tiga jenis kuis):
 *   quiz_options.score_value = 0  -> salah / tidak ada bobot
 *   quiz_options.score_value > 0  -> benar (pre/post-test) atau bobot minat
 *
 * Semua fungsi di sini murni (tanpa I/O) supaya gampang dites.
 */

/** Nilai tertinggi yang bisa didapat dari satu soal. */
function maxScoreOf(q: QuizQuestion): number {
  return q.quiz_options.reduce((m, o) => Math.max(m, o.score_value), 0)
}

/** Nilai opsi yang dipilih user untuk soal ini (0 kalau belum menjawab). */
function pickedScoreOf(q: QuizQuestion, answers: AnswerMap): number {
  const picked = q.quiz_options.find((o) => o.id === answers[q.id])
  return picked?.score_value ?? 0
}

// ---------------------------------------------------------------------
// Onboarding (kind = 'interest')
// ---------------------------------------------------------------------

/**
 * Jumlahkan bobot minat per kategori. Kategori dengan skor tertinggi
 * direkomendasikan lebih dulu; seri dipecahkan oleh order_index kategori
 * sehingga hasilnya deterministik.
 */
export function scoreInterest(
  questions: QuizQuestion[],
  categories: Category[],
  answers: AnswerMap
): InterestResult {
  const byCategory = new Map<string, { score: number; total: number }>()

  for (const q of questions) {
    const cur = byCategory.get(q.category_id) ?? { score: 0, total: 0 }
    cur.score += pickedScoreOf(q, answers)
    cur.total += maxScoreOf(q)
    byCategory.set(q.category_id, cur)
  }

  const categoryScores = categories
    .filter((c) => byCategory.has(c.id))
    .map((c) => ({ category: c, ...byCategory.get(c.id)! }))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.category.order_index - b.category.order_index
    )

  return {
    recommendedCategory: categoryScores[0]?.category ?? null,
    categoryScores,
  }
}

// ---------------------------------------------------------------------
// Pre-test / post-test (kind = 'pretest' | 'posttest')
// ---------------------------------------------------------------------

export function scoreKnowledge(
  questions: QuizQuestion[],
  answers: AnswerMap
): KnowledgeResult {
  let score = 0
  let total = 0
  for (const q of questions) {
    total += maxScoreOf(q)
    score += pickedScoreOf(q, answers)
  }
  return { score, total }
}

// Ambang "advanced" = 70% dari total, dibulatkan ke atas. Dihitung dengan
// bilangan bulat (7/10) supaya tidak kena galat floating point
// (mis. 10 * 0.7 = 7.000000000000001 -> ceil = 8).
export const ADVANCED_RATIO = { num: 7, den: 10 } as const

/** Jumlah skor minimum agar user dianggap advanced pada kuis sebesar `total`. */
export function advancedThreshold(total: number): number {
  return Math.ceil((total * ADVANCED_RATIO.num) / ADVANCED_RATIO.den)
}

export function levelFromPretest(score: number, total: number): Level {
  if (total <= 0) return 'beginner'
  return score >= advancedThreshold(total) ? 'advanced' : 'beginner'
}