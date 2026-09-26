import { PrismaClient, TipRuleType } from "@prisma/client";

const prisma = new PrismaClient();

const TIP_TEMPLATES: Array<{
  code: string;
  ruleType: TipRuleType;
  titleTpl: string;
  bodyTpl: string;
}> = [
  {
    code: "R1_OVER_BUDGET",
    ruleType: TipRuleType.OVER_BUDGET,
    titleTpl: "{category} may exceed your budget",
    bodyTpl:
      "At this pace, {category} may go about {amount} over budget. Try keeping it near {weeklyCap} per week.",
  },
  {
    code: "R2_ABOVE_AVERAGE",
    ruleType: TipRuleType.ABOVE_AVERAGE,
    titleTpl: "{category} is trending above your usual",
    bodyTpl:
      "Projected {category} spending is up {percent}% from your 3-month average. Potential overspend: {amount}.",
  },
  {
    code: "R3_SMALL_FREQUENT",
    ruleType: TipRuleType.SMALL_FREQUENT,
    titleTpl: "Small {category} purchases are adding up",
    bodyTpl:
      "You made {count} small {category} purchases in 7 days ({total} total). Cutting half could save around {amount}.",
  },
  {
    code: "R4_SUBSCRIPTIONS",
    ruleType: TipRuleType.SUBSCRIPTIONS,
    titleTpl: "Review your subscriptions",
    bodyTpl:
      "You currently have {count} subscriptions. Pausing the least-used one may save about {amount} this month.",
  },
  {
    code: "R5_SAVINGS_GAP",
    ruleType: TipRuleType.SAVINGS_GAP,
    titleTpl: "Savings goal gap detected",
    bodyTpl:
      "You are currently {amount} short of your monthly savings goal. Try trimming flexible expenses this week.",
  },
  {
    code: "R6_WEEKEND_SPIKE",
    ruleType: TipRuleType.WEEKEND_SPIKE,
    titleTpl: "Weekend spending spike",
    bodyTpl:
      "Weekend spending reached {percent}% of your last 7-day expenses. Potential reducible amount: {amount}.",
  },
  {
    code: "R0_GENERAL",
    ruleType: TipRuleType.GENERAL,
    titleTpl: "Quick savings habit",
    bodyTpl:
      "Plan your weekly spending in advance and review one category every Sunday to stay in control.",
  },
];

async function main() {
  for (const template of TIP_TEMPLATES) {
    await prisma.tipTemplate.upsert({
      where: {
        code: template.code,
      },
      update: {
        ruleType: template.ruleType,
        titleTpl: template.titleTpl,
        bodyTpl: template.bodyTpl,
        locale: "en",
        isActive: true,
      },
      create: {
        code: template.code,
        ruleType: template.ruleType,
        titleTpl: template.titleTpl,
        bodyTpl: template.bodyTpl,
        locale: "en",
        isActive: true,
      },
    });
  }

  process.stdout.write(`Seeded ${TIP_TEMPLATES.length} tip templates.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
