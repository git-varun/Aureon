// The full set of holding classes classify() can ever return — used to
// validate allocation-target asset_class values so a target can't be saved
// for a class no holding will ever be classified into.
export const KNOWN_HOLDING_CLASSES = [
  "stocks", "crypto", "bonds", "funds", "real_estate", "retirement", "insurance", "stablecoin",
] as const;

// Port of app/modules/market/services/market.py classify().
export function classify(assetClass: string | null | undefined, symbol = ""): string {
  if (!assetClass) return "stocks";
  const ac = assetClass.toLowerCase();
  if (ac.includes("stablecoin")) return "stablecoin";
  if (ac.includes("crypto")) return "crypto";
  if (ac.includes("bond")) return "bonds";
  if (ac.includes("mutual_fund") || ac.includes("fund")) return "funds";
  if (ac.includes("real_estate") || ac.includes("property")) return "real_estate";
  if (ac.includes("retirement") || ac.includes("epf") || ac.includes("nps")) return "retirement";
  if (ac.includes("insurance")) return "insurance";
  if (symbol.endsWith("_MF")) return "funds";
  if (symbol.endsWith("-USD")) return "crypto";
  return "stocks";
}
