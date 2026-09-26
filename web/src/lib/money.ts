export function formatMoney(amount: string | number, currency = "USD"): string {
  const numericValue = typeof amount === "number" ? amount : Number(amount);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
}
