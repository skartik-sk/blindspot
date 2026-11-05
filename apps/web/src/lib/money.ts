// Display helpers. USDC has 6 decimals. INR shown at a fixed demo rate (VITE_INR_PER_USDC).
export const INR_PER_USDC = Number(import.meta.env.VITE_INR_PER_USDC ?? 84);
export const USDC_DECIMALS = 6;

export const inrToUsdcUnits = (inr: number) => BigInt(Math.round((inr / INR_PER_USDC) * 10 ** USDC_DECIMALS));
export const usdcUnitsToInr = (u: bigint) => (Number(u) / 10 ** USDC_DECIMALS) * INR_PER_USDC;
export const fmtUsdc = (u: bigint) => (Number(u) / 10 ** USDC_DECIMALS).toFixed(2);
export const fmtInr = (inr: number) => `₹${inr.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
