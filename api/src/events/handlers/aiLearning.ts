import { domainEventBus } from "../bus.js";
import { categorizerService } from "../../modules/ai/categorizer.service.js";

let handlerRegistered = false;

export function registerAiLearningHandler(): void {
  if (handlerRegistered) {
    return;
  }

  domainEventBus.on("transaction.created", async (payload) => {
    const source = payload.categorySource;
    if (source !== "user" && source !== "ai_overridden") {
      return;
    }

    const description = payload.description?.trim();
    if (!description) {
      return;
    }

    await categorizerService.submitFeedback({
      userId: payload.userId,
      description,
      suggestedCategoryId: payload.aiSuggestedCategoryId ?? null,
      chosenCategoryId: payload.categoryId,
    });
  });

  handlerRegistered = true;
}
