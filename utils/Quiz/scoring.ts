import type {
  AnswerMap,
  Category,
  DeterminedLevel,
  OnboardingQuestion,
  OnboardingRecommendation,
} from './types'

/**
 * Rule-based onboarding scorer.
 *
 * Two separate signals are computed from the same answer set:
 *
 * 1. PROFICIENCY  — questions with category_id = null feed a total score
 *    that is bucketed into beginner / intermediate / advanced. This sets
 *    the difficulty level the platform starts the user at.
 *
 * 2. INTEREST/FAMILIARITY PER CATEGORY — questions tied to a category_id
 *    are summed per category. The category with the highest sum is the
 *    one the user is most proficient in / most interested in, and becomes
 *    the recommended starting material.
 *
 * This is intentionally simple arithmetic (sum + threshold + argmax) —
 * no ML — matching the "rule-based recommendation" scope of the platform.
 */

const LEVEL_THRESHOLDS: { max: number; level: DeterminedLevel }[] = [
  { max: 1 / 3, level: 'beginner' },
  { max: 2 / 3, level: 'intermediate' },
  { max: 1, level: 'advanced' },
]

export function scoreOnboarding(
  questions: OnboardingQuestion[],
  categories: Category[],
  answers: AnswerMap
): OnboardingRecommendation {
  const generalQuestions = questions.filter((q) => q.category_id === null)
  const categoryQuestions = questions.filter((q) => q.category_id !== null)

  // --- 1. Proficiency score -> determined_level -----------------------
  let totalScore = 0
  let maxGeneralScore = 0

  for (const q of generalQuestions) {
    const maxOptionScore = Math.max(...q.onboarding_options.map((o) => o.score_value))
    maxGeneralScore += maxOptionScore

    const selectedId = answers[q.id]
    const selected = q.onboarding_options.find((o) => o.id === selectedId)
    if (selected) totalScore += selected.score_value
  }

  const ratio = maxGeneralScore > 0 ? totalScore / maxGeneralScore : 0
  const determinedLevel =
    LEVEL_THRESHOLDS.find((t) => ratio <= t.max)?.level ?? 'beginner'

  // --- 2. Per-category interest/familiarity -> recommended category ---
  const scoreByCategory = new Map<string, number>()
  for (const q of categoryQuestions) {
    if (!q.category_id) continue
    const selectedId = answers[q.id]
    const selected = q.onboarding_options.find((o) => o.id === selectedId)
    const value = selected?.score_value ?? 0
    scoreByCategory.set(q.category_id, (scoreByCategory.get(q.category_id) ?? 0) + value)
  }

  const categoryScores = categories
    .filter((c) => scoreByCategory.has(c.id))
    .map((c) => ({ category: c, score: scoreByCategory.get(c.id) ?? 0 }))
    .sort((a, b) => {
      // Highest score wins; ties broken by the platform's default
      // learning sequence (order_index), so the recommendation is
      // deterministic even when interest is evenly spread.
      if (b.score !== a.score) return b.score - a.score
      return a.category.order_index - b.category.order_index
    })

  const recommendedCategory = categoryScores[0]?.category ?? null

  return {
    determinedLevel,
    totalScore,
    maxGeneralScore,
    recommendedCategory,
    categoryScores,
  }
}