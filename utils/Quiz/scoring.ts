import type {
  AnswerMap,
  Category,
  InterestResult,
  KnowledgeResult,
  Level,
  QuizQuestion,
} from './types'

function maxScoreOf(q: QuizQuestion): number {
  return q.quiz_options.reduce((m, o) => Math.max(m, o.score_value), 0)
}

function pickedScoreOf(q: QuizQuestion, answers: AnswerMap): number {
  const picked = q.quiz_options.find((o) => o.id === answers[q.id])
  return picked?.score_value ?? 0
}
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

export const ADVANCED_RATIO = { num: 7, den: 10 } as const

export function advancedThreshold(total: number): number {
  return Math.ceil((total * ADVANCED_RATIO.num) / ADVANCED_RATIO.den)
}

export function levelFromPretest(score: number, total: number): Level {
  if (total <= 0) return 'beginner'
  return score >= advancedThreshold(total) ? 'advanced' : 'beginner'
}