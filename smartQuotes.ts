export function applySmartQuotes(text: string): string {
  if (!text) return text;
  // Opening quotes lookbehind: space, start, typical opening punctuation
  let result = text.replace(/(^|[\s\(\[\{<—\-\*\_])"/g, '$1“');
  // At this point, the remaining quotes are likely closing quotes
  result = result.replace(/"/g, '”');
  return result;
}
console.log(applySmartQuotes('Hello "world". "Test" "Here" is a "string". "Wait"-'));
