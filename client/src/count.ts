const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** 累積的抽牌數：×2 一直疊可以到幾百億，太長就縮寫（567.1億 / 56.7B），大到縮寫也塞不下就用科學記號 */
export function formatCount(n: number): string {
  if (n < 100_000) return String(n);
  if (n < 1e15) return compact.format(n);
  return n.toExponential(1).replace('e+', 'e');
}
