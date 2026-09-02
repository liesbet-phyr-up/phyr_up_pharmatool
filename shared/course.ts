export const COURSE_CATEGORIES = [
  "product_training",
  "self_development",
  "business_training_101",
  "kpis",
  "regulatory_training",
] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  product_training: "Product Training",
  self_development: "Self Development",
  business_training_101: "Business Training 101",
  kpis: "KPIs",
  regulatory_training: "Regulatory Training",
};

export const COURSE_MODULE_TYPES = ["video", "document", "slides", "lesson", "quiz", "acknowledgement"] as const;
export type CourseModuleType = (typeof COURSE_MODULE_TYPES)[number];

export const ASSESSMENT_QUESTION_TYPES = ["multiple_choice", "short_answer"] as const;
export type AssessmentQuestionType = (typeof ASSESSMENT_QUESTION_TYPES)[number];
