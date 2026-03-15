// Copyright (C) 2026 StableLlama
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Defines the smart quotes unit so this responsibility stays isolated, testable, and easy to evolve.
 */

export function applySmartQuotes(text: string): string {
  if (!text) return text;
  // Opening quotes lookbehind: space, start, typical opening punctuation
  let result = text.replace(/(^|[\s\(\[\{<—\-\*\_])"/g, '$1“');
  // At this point, the remaining quotes are likely closing quotes
  result = result.replace(/"/g, '”');
  return result;
}
console.log(applySmartQuotes('Hello "world". "Test" "Here" is a "string". "Wait"-'));
