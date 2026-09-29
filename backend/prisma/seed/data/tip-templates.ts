/**
 * tip-templates.ts
 * ~15 English tip templates for the 7 tip rules (R0–R6). Placeholders: {category}, {amount},
 * {percent} – filled and escaped by the tips engine (P13). Codes are stable keys for upserts.
 * Main export: TIP_TEMPLATES
 * Spec: docs/spec/05b §5.10 (Bảng 23) · docs/spec/06 §6.3.6 (Bảng 35), §6.5
 */

/** Seed definition of one tip template. */
export interface TipTemplateSeed {
  code: string;
  ruleType:
    | 'over_budget'
    | 'above_average'
    | 'small_frequent'
    | 'subscriptions'
    | 'savings_gap'
    | 'weekend_spike'
    | 'general';
  titleTpl: string;
  bodyTpl: string;
}

/** System tip templates (locale "en"). */
export const TIP_TEMPLATES: readonly TipTemplateSeed[] = [
  // R1 – projected spending exceeds the budget
  {
    code: 'R1_OVER_BUDGET_1',
    ruleType: 'over_budget',
    titleTpl: '{category} is heading over budget',
    bodyTpl:
      'At your current pace, {category} will go over budget by {amount}. Try setting a weekly cap for the rest of the month.',
  },
  {
    code: 'R1_OVER_BUDGET_2',
    ruleType: 'over_budget',
    titleTpl: 'Slow down on {category}',
    bodyTpl:
      'You have already used {percent} of your {category} budget. Cutting back a little now could save you {amount}.',
  },
  // R2 – spending above the 3-month average
  {
    code: 'R2_ABOVE_AVERAGE_1',
    ruleType: 'above_average',
    titleTpl: '{category} spending is up {percent}',
    bodyTpl:
      'You are spending {percent} more on {category} than usual. Bringing it back to your average would save about {amount}.',
  },
  {
    code: 'R2_ABOVE_AVERAGE_2',
    ruleType: 'above_average',
    titleTpl: 'Unusual month for {category}',
    bodyTpl:
      'This month {category} is well above your normal level. Review recent purchases to find {amount} you could skip.',
  },
  // R3 – many small repeated purchases
  {
    code: 'R3_SMALL_FREQUENT_1',
    ruleType: 'small_frequent',
    titleTpl: 'Small {category} purchases add up',
    bodyTpl:
      'Lots of small {category} purchases this week add up quickly. Planning ahead could save around {amount}.',
  },
  {
    code: 'R3_SMALL_FREQUENT_2',
    ruleType: 'small_frequent',
    titleTpl: 'Try a DIY week for {category}',
    bodyTpl:
      'Making coffee or snacks at home instead of buying them could cut your {category} spending by about {amount}.',
  },
  // R4 – several subscriptions
  {
    code: 'R4_SUBSCRIPTIONS_1',
    ruleType: 'subscriptions',
    titleTpl: 'Check your subscriptions',
    bodyTpl:
      'You are paying for several subscriptions. Cancelling the one you use least would save {amount} a month.',
  },
  {
    code: 'R4_SUBSCRIPTIONS_2',
    ruleType: 'subscriptions',
    titleTpl: 'Share or switch a plan',
    bodyTpl:
      'Student or family plans can be much cheaper. Switching one subscription could save you around {amount}.',
  },
  // R5 – savings goal not on track
  {
    code: 'R5_SAVINGS_GAP_1',
    ruleType: 'savings_gap',
    titleTpl: 'You are {amount} short of your savings goal',
    bodyTpl:
      'At this pace you will miss your monthly savings goal by {amount}. Moving money to savings at the start of the month helps.',
  },
  {
    code: 'R5_SAVINGS_GAP_2',
    ruleType: 'savings_gap',
    titleTpl: 'Close the savings gap',
    bodyTpl:
      'Trimming {category} a little would close most of your {amount} savings gap this month.',
  },
  // R6 – weekend spending spike
  {
    code: 'R6_WEEKEND_SPIKE_1',
    ruleType: 'weekend_spike',
    titleTpl: 'Weekends take {percent} of your spending',
    bodyTpl:
      'Your weekend spending was {percent} of the week. Setting a weekend budget could save about {amount}.',
  },
  {
    code: 'R6_WEEKEND_SPIKE_2',
    ruleType: 'weekend_spike',
    titleTpl: 'Plan a low-cost weekend',
    bodyTpl:
      'Free campus events, picnics or movie nights at home can keep weekend costs down by {amount}.',
  },
  // R0 – general tips (always available, low score)
  {
    code: 'R0_GENERAL_1',
    ruleType: 'general',
    titleTpl: 'Pay yourself first',
    bodyTpl:
      'Move a fixed amount to savings as soon as your allowance arrives, then spend what is left.',
  },
  {
    code: 'R0_GENERAL_2',
    ruleType: 'general',
    titleTpl: 'Use your student discount',
    bodyTpl: 'Always ask for a student discount on transport, software, books and entertainment.',
  },
  {
    code: 'R0_GENERAL_3',
    ruleType: 'general',
    titleTpl: 'Wait 24 hours before buying',
    bodyTpl:
      'For non-essential purchases, wait a day. If you still want it tomorrow, it is probably worth it.',
  },
];
