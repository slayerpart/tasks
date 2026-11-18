import { createContext, use, type ReactNode } from "react";
import type { Feedback } from "./feedback.ts";

const FeedbackContext = createContext<Feedback | null>(null);

export function FeedbackProvider({
  feedback,
  children,
}: {
  feedback: Feedback;
  children: ReactNode;
}) {
  return <FeedbackContext value={feedback}>{children}</FeedbackContext>;
}

export function useFeedback(): Feedback {
  const feedback = use(FeedbackContext);
  if (feedback === null) throw new Error("useFeedback needs a FeedbackProvider.");
  return feedback;
}
