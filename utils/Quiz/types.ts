// Save as: utils/Quiz/types.ts (MENGGANTIKAN versi lama)
//
// Types mirror public.quizzes / public.quiz_questions / public.quiz_options /
// public.quiz_results. Soal dikelompokkan per kuis (quiz_id); kategori dan
// jenis kuis (QuizKind) dibaca dari tabel quizzes. Aturan nilai opsi:
// score_value 0 = salah / tidak relevan, > 0 = benar (quiz/pretest/posttest)
// atau bobot minat (interest).

export type QuizKind = 'interest' | 'pretest' | 'posttest' | 'quiz'
export type Level = 'beginner' | 'advanced'
import type { UnrestrictedFileUploadCriteria } from "@/../utils/Quiz/A06/file-upload-evaluator";
import type { SqliCriteria } from "./A05/Sql/sqli-evaluator";
//import type { AccessControlCriteria } from "../Quiz/A01/lab2/access control evaluatrp";
import type { XxeLocalFileReadCriteria } from "@/../utils/Quiz/A02/xxe-evaluator";
import type { SsrfUrlImportCriteria } from "@/../utils/Quiz/A01/lab3/ssrf-url-import-evaluator";
import type { FailOpenAuthzCriteria } from "@/../utils/Quiz/A10/fail-open-evaluator";
import type { SessionFixationLoginCriteria } from "./A07/session-fixation-login-evaluator";
import type { LogInjectionCriteria } from "@/../utils/Quiz/A09/log-injection-evaluator";
import type { IdorProfileCriteria } from "@/../utils/Quiz/A01/lab1/idor-profile-evaluator";
import type { CsrfTransferCriteria } from "@/../utils/Quiz/A01/lab2/CRSF-transfer-evaluator";

import type { StoredXssCriteria } from "./A05/xss/xss-evaluator";

export interface QuizOption {
  id: string
  question_id: string
  option_text: string
  score_value: number
  order_index: number
}
export interface QuizQuestion {
  id: string
  quiz_id: string
  kind: QuizKind
  question_text: string
  category_id: string
  order_index: number
  quiz_options: QuizOption[]
}

export interface Category {
  id: string
  code: string
  name: string
  description: string | null
  owasp_rank: number | null
  order_index: number
}

export type AnswerMap = Record<string, string>

export interface CategoryScore {
  category: Category
  score: number
  total: number
}

export interface InterestResult {
  recommendedCategory: Category | null
  categoryScores: CategoryScore[]
}

export interface KnowledgeResult {
  score: number
  total: number
}

export type RaceConditionLabCriteria = {
  type: "race_condition_lab";
  app_name: string;
  scenario_label: string;
  default_starting_balance: number;
  default_withdrawal_amount: number;
};

export type ExerciseCriteria =
  | SqliCriteria
  | FailOpenAuthzCriteria
  | SessionFixationLoginCriteria
  | StoredXssCriteria
  | XxeLocalFileReadCriteria
  | IdorProfileCriteria
  | CsrfTransferCriteria| LogInjectionCriteria
  | SsrfUrlImportCriteria|UnrestrictedFileUploadCriteria;