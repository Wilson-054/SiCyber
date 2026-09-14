  // Types mirror public.onboarding_questions / public.onboarding_options
  // and public.user_onboarding_result from the schema migration.

  export type DeterminedLevel = 'beginner' | 'intermediate' | 'advanced'

  import type { SqliCriteria } from "./A05/Sql/sqli-evaluator";
  //import type { AccessControlCriteria } from "../Quiz/A01/lab2/access control evaluatrp";
  import type { MisconfigDebugCriteria } from "@/../utils/Quiz/misconfig-evaluator";
  import type { AuthWeakTokenDbCriteria } from "@/../utils/Quiz/auth-evaluator";
  import type { CryptoWeakHashCriteria } from "@/../utils/Quiz/crypto-evaluator";
  import type { InsecureDesignPriceCriteria } from "@/../utils/Quiz/insecure-design-evaluator";
  import type { MisconfigDockerSocketCriteria } from "./docker-socket-evaluator";
  import type { XxeFileReadCriteria } from "./xxe-evaluator";
import type { CookieTheftCriteria } from "./A02/cookie-theft-evaluator";
import type { SsrfUrlImportCriteria } from "@/../utils/Quiz/A01/lab3/ssrf-url-import-evaluator";
  import type { MisconfigOpenBucketCriteria } from "./cloud-storage-evaluator";
  import type { MisconfigDockerEscapeCriteria } from "./docker-escape-evaluator";
import type { ErrorDebugExposureCriteria } from "@/../utils/Quiz/A10/error-debug-exposure-evaluator";
import type { SessionFixationCriteria } from "./A07/session-fixation-evaluator";
import type { IdorProfileCriteria } from "@/../utils/Quiz/A01/lab1/idor-profile-evaluator";
import type { CsrfTransferCriteria } from "@/../utils/Quiz/A01/lab2/CRSF-transfer-evaluator";

import type { StoredXssCriteria } from "./A05/xss/xss-evaluator";



  import type { XxeBlindExfilCriteria } from "./xxe-blind-evaluator";
  export interface OnboardingOption {
    id: string
    question_id: string
    option_text: string
    score_value: number
    order_index: number
  }

  export interface OnboardingQuestion {
    id: string
    question_text: string
    category_id: string | null // null = general proficiency question
    order_index: number
    onboarding_options: OnboardingOption[]
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

  export interface OnboardingRecommendation {
    determinedLevel: DeterminedLevel
    totalScore: number
    maxGeneralScore: number
    recommendedCategory: Category | null
    categoryScores: { category: Category; score: number }[]
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
    | MisconfigDebugCriteria
    | AuthWeakTokenDbCriteria
    | CryptoWeakHashCriteria
    | InsecureDesignPriceCriteria
    | RaceConditionLabCriteria
    | MisconfigDockerSocketCriteria
    | XxeFileReadCriteria
    | MisconfigOpenBucketCriteria
    | MisconfigDockerSocketCriteria    // baru - dasar
    | XxeFileReadCriteria              // baru - dasar
    | MisconfigOpenBucketCriteria|
    XxeBlindExfilCriteria|
    MisconfigDockerEscapeCriteria| ErrorDebugExposureCriteria
    | SessionFixationCriteria| StoredXssCriteria
  | CookieTheftCriteria | IdorProfileCriteria
  | CsrfTransferCriteria | SsrfUrlImportCriteria;