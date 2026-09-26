export type ForecastItem = {
  categoryId: number;
  categoryName: string;
  type: "income" | "expense";
  predictedAmount: string;
  lowerBound: string;
  upperBound: string;
  insufficientData: boolean;
};

export type NextMonthForecastResponse = {
  month: string;
  insufficientData: boolean;
  items: ForecastItem[];
};
