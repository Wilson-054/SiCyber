// Types mirror public.quiz_questions / public.quiz_options /
  // public.quiz_results. Satu bank soal dipakai untuk tiga jenis kuis
  // (lihat QuizKind); aturan nilai opsi: score_value 0 = salah / tidak
  // relevan, > 0 = benar (pre/post-test) atau bobot minat (interest).

  export type QuizKind = 'interest' | 'pretest' | 'posttest'
  export type Level = 'beginner' | 'advanced'

  import type { SqliCriteria } from "./A05/Sql/sqli-evaluator";
  //import type { AccessControlCriteria } from "../Quiz/A01/lab2/access control evaluatrp";
import type { CookieTheftCriteria } from "./A02/cookie-theft-evaluator";
import type { SsrfUrlImportCriteria } from "@/../utils/Quiz/A01/lab3/ssrf-url-import-evaluator";
import type { ErrorDebugExposureCriteria } from "@/../utils/Quiz/A10/error-debug-exposure-evaluator";
import type { SessionFixationCriteria } from "./A07/session-fixation-evaluator";
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

  // answers[questionId] = selected option's id
  export type AnswerMap = Record<string, string>

  export interface CategoryScore {
    category: Category
    score: number
    total: number
  }

  // Hasil kuis minat (onboarding).
  export interface InterestResult {
    recommendedCategory: Category | null
    categoryScores: CategoryScore[]
  }

  // Hasil kuis pengetahuan (pre-test / post-test) untuk satu kategori.
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
    | SqliCriteria |ErrorDebugExposureCriteria
    | SessionFixationCriteria| StoredXssCriteria
  | CookieTheftCriteria | IdorProfileCriteria
  | CsrfTransferCriteria | SsrfUrlImportCriteria;