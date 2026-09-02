import { and, eq } from "drizzle-orm";
import { assessmentQuestions, assessments, courseModules, courses } from "../drizzle/schema";
import { getDb } from "./db";

const courseTitle = "Vaginal Infections & The Power of pH";

const coreTraining = `# Core Training 1: The Power of pH

## Your purpose

This core training helps front-shop staff explain, in simple terms, why a pH-balanced wash can be a useful add-on when a customer collects a Schedule 2 vaginal cream for thrush or bacterial vaginosis. Use this knowledge to support the pharmacist — not to diagnose, prescribe, or replace pharmacist advice.

## The principle: why pH matters

A healthy vaginal environment is usually mildly acidic, at roughly pH 3.8–4.5. This acidity supports beneficial bacteria, including Lactobacilli, and helps limit overgrowth of organisms such as yeast.

Ordinary body soaps and shower gels are usually alkaline. Using them in the intimate area can disturb the natural acidic barrier. When a customer is buying treatment for an infection, advise that they avoid regular soap in the intimate area while recovering.

## The supportive add-on

Dedicated pH-balanced intimate washes, such as Femagene, are formulated for the external intimate area. They can help clean gently without stripping the natural barrier and may help soothe irritation. The key principle is maintaining an appropriate external pH balance while the prescribed or pharmacist-recommended treatment is used.

## How to explain it simply

1. **Acknowledge the treatment:** “These creams work well to clear up the problem.”
2. **Explain the pH point:** “Normal body soap can upset the natural acidic barrier, which can allow yeast and bad bacteria to grow.”
3. **Offer the support:** “While using this cream, consider a pH-balanced wash like Femagene for external use. It is designed to be gentler on the natural balance.”

## Safety: when staff must refer

Intimate washes are for **external use only**. Customers should not douche or put soap inside the vagina.

Refer the customer to the pharmacist immediately if they report fever, pelvic pain, abnormal or foul-smelling discharge, a fishy smell, or repeated thrush (more than twice in six months). Also reinforce breathable cotton underwear and avoiding tight clothing while symptoms settle.

## Key message

Keep it simple: avoid ordinary soap in the intimate area, use a suitable external pH-balanced wash if appropriate, and refer red flags to the pharmacist.`;

const rolePlay = `# Core Training 2: Practical Front-Shop Role-Play

## Scenario 1: Standard add-on conversation

**Customer:** “Hi, the pharmacist said my cream for thrush is ready.”

**Assistant:** “Hello. Yes, I have it right here. These creams work well to clear up the problem. While you are treating it, can I ask what you usually use to wash with?”

**Customer:** “Just my normal shower gel.”

**Assistant:** “Normal body soap can upset the natural acidic barrier, which allows yeast and bad bacteria to grow. While you are using this cream, consider switching to a pH-balanced wash like Femagene for external use. It can help soothe irritation and support the natural balance.”

**Customer:** “Okay, that makes sense. I will take one too.”

**Assistant:** “Great. Please remember it is for external use only, and breathable cotton underwear can also be more comfortable while things settle.”

## Scenario 2: Recognise the referral point

**Customer:** “I need another tube of that thrush cream. I was just here last month.”

**Assistant:** “I can help. Since you were here recently, are you getting this quite often?”

**Customer:** “Yes, it is the third time in a few months. This time it smells a bit different — kind of fishy.”

**Assistant:** “I am sorry you are dealing with that. Because it keeps coming back and the smell has changed, I need to ask the pharmacist to speak with you. It may not be thrush, and we want to make sure you receive the right treatment.”

**Practice goal:** Be empathetic, keep the explanation simple, and refer red flags without delay.`;

const questions = [
  { prompt: "What is the usual healthy vaginal pH range for most people of reproductive age?", choices: ["1.0–2.0", "3.8–4.5", "6.5–7.5", "8.0–10.0"], correctChoice: "3.8–4.5" },
  { prompt: "Why is an acidic vaginal environment important?", choices: ["It supports protective lactobacilli and helps limit overgrowth of some organisms.", "It makes vaginal cream unnecessary.", "It means regular body soap is always suitable.", "It permanently prevents all vaginal infections."], correctChoice: "It supports protective lactobacilli and helps limit overgrowth of some organisms." },
  { prompt: "Where should a pH-balanced intimate wash be used?", choices: ["Inside the vagina.", "On the external vulval area only.", "Inside the vagina after every toilet visit.", "Only when mixed with a vaginal cream."], correctChoice: "On the external vulval area only." },
  { prompt: "A customer collecting a vaginal treatment asks which cleansing product is most appropriate. What is the best principle-led recommendation?", choices: ["A strongly perfumed body wash.", "An alkaline antibacterial soap.", "A gentle, fragrance-free, pH-balanced wash for external use, if suitable.", "Vaginal douching with soap and water."], correctChoice: "A gentle, fragrance-free, pH-balanced wash for external use, if suitable." },
  { prompt: "Which presentation should be referred to the pharmacist rather than managed only with a product add-on?", choices: ["A first-time patient with fever, pelvic pain, or abnormal/foul-smelling discharge.", "A patient asking how to use an external pH-balanced wash.", "A patient choosing between fragrance-free intimate-wash options.", "A patient who wants general advice on breathable underwear."], correctChoice: "A first-time patient with fever, pelvic pain, or abnormal/foul-smelling discharge." },
];

export async function importVaginalPHStarterCourse(createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [existing] = await db.select({ id: courses.id }).from(courses).where(eq(courses.title, courseTitle)).limit(1);
  if (existing) return { courseId: existing.id, created: false };

  await db.insert(courses).values({
    title: courseTitle,
    summary: "Required front-shop product training: understand the power of pH, practise a safe add-on conversation, and complete the knowledge check.",
    category: "product_training",
    audience: "Front-shop staff",
    estimatedMinutes: 12,
    isRequired: 1,
    status: "published",
    createdBy,
  });
  const [course] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.title, courseTitle), eq(courses.createdBy, createdBy))).limit(1);
  if (!course) throw new Error("Starter course could not be created");

  await db.insert(courseModules).values([
    { courseId: course.id, title: "Core Training 1: The Power of pH", moduleType: "lesson", body: coreTraining, position: 1, estimatedMinutes: 4, isRequired: 1 },
    { courseId: course.id, title: "Core Training 2: Practical Front-Shop Role-Play", moduleType: "lesson", body: rolePlay, position: 2, estimatedMinutes: 4, isRequired: 1 },
    { courseId: course.id, title: "Core Training 3: Knowledge Check", moduleType: "quiz", body: "Answer all five questions. You need 80% to pass and complete this required course.", position: 3, estimatedMinutes: 4, isRequired: 1 },
  ]);
  const moduleRows = await db.select({ id: courseModules.id, title: courseModules.title }).from(courseModules).where(eq(courseModules.courseId, course.id));
  const quizModule = moduleRows.find(module => module.title === "Core Training 3: Knowledge Check");
  if (!quizModule) throw new Error("Starter quiz step could not be created");

  await db.insert(assessments).values({ courseId: course.id, moduleId: quizModule.id, title: "Vaginal pH knowledge check", passingMark: 80, attemptLimit: 3 });
  const [assessment] = await db.select({ id: assessments.id }).from(assessments).where(and(eq(assessments.courseId, course.id), eq(assessments.moduleId, quizModule.id))).limit(1);
  if (!assessment) throw new Error("Starter assessment could not be created");

  await db.insert(assessmentQuestions).values(questions.map((question, index) => ({
    assessmentId: assessment.id,
    prompt: question.prompt,
    questionType: "multiple_choice" as const,
    choicesJson: JSON.stringify(question.choices),
    correctChoice: question.correctChoice,
    position: index + 1,
  })));

  return { courseId: course.id, created: true };
}
