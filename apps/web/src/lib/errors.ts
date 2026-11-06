// Plain-language versions of transport errors. The raw text stays available (Network page, tooltips).
export function friendly(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (/DnsFailed|did not resolve|ENOTFOUND/i.test(raw)) return "A server address can't be reached through the mixnet. Retrying.";
  if (/did not complete within|timed out|timeout/i.test(raw)) return "A mixnet route was slow. Retrying on a fresh route.";
  if (/rate limit|-32005|\b429\b/i.test(raw)) return "The block provider is busy. Retrying in a moment.";
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return "No network connection. Retrying.";
  if (/Opening a route/i.test(raw)) return raw;
  return "Couldn't read the next block. Retrying.";
}
