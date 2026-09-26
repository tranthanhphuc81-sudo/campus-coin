export type SuggestCategoryInput = {
  userId: string;
  description: string;
  amount: string;
  type: "income" | "expense";
};

export type AiSuggestionSource = "user_rule" | "keyword" | "llm";

export type AiSuggestion = {
  categoryId: number;
  categoryName: string;
  confidence: number;
  source: AiSuggestionSource;
};

export type SuggestCategoryResult = AiSuggestion | null;

export type FeedbackInput = {
  userId: string;
  description: string;
  suggestedCategoryId: number | null;
  chosenCategoryId: number;
};
