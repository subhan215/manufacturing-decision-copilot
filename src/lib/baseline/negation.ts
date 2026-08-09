/**
 * NegEx-style negation detection.
 *
 * A deliberately faithful implementation of the standard rule-based approach
 * from clinical NLP: a curated list of trigger phrases, string-matched against
 * the text, with target terms falling inside a token window from the trigger
 * classified as negated. Pseudo-triggers ("not only", "no increase") are
 * excluded because they contain a trigger string without negating anything.
 *
 * This exists so the baseline is a fair opponent rather than a strawman.
 * Negation handling is roughly twenty-five years old, freely available, and
 * reaches ~0.94 accuracy in published evaluations; a rule-based comparison that
 * omitted it would be beating a system we had deliberately weakened, and the
 * resulting "win" would say nothing about our own system's value.
 */

/** Phrases that negate terms appearing AFTER them. */
export const PRE_NEGATION_TRIGGERS = [
  "no ",
  "not ",
  "without",
  "denies",
  "denied",
  "absent",
  "lacks",
  "lacking",
  "free of",
  "no evidence of",
  "no sign of",
  "no indication of",
  "unable to",
  "does not",
  "do not",
  "did not",
  "cannot",
  "never",
  "none of",
  "no longer",
  "rather than",
  "instead of",
];

/** Phrases that negate terms appearing BEFORE them. */
export const POST_NEGATION_TRIGGERS = [
  "is not installed",
  "not installed",
  "not available",
  "not offered",
  "not operational",
  "not yet operational",
  "unavailable",
  "is absent",
];

/**
 * Strings that contain a trigger but do not negate. Without these, "not only
 * liquid but also cream" would be read as denying liquid capability.
 */
export const PSEUDO_TRIGGERS = [
  "not only",
  "no increase",
  "no change",
  "not certain whether",
  "not necessarily",
  "no less than",
  "no fewer than",
];

/** Terms that end a negation's scope — the clause has moved on. */
export const SCOPE_TERMINATORS = [
  " but ",
  " however",
  " although",
  " though",
  " except",
  " aside from",
  " apart from",
  ";",
  ".",
];

export const DEFAULT_WINDOW_CHARS = 120;

function stripMarkup(text: string): string {
  return text.replace(/[*_`>]/g, "");
}

/**
 * Is `term` negated anywhere it appears in `text`?
 *
 * Returns true only if EVERY occurrence is negated: a document that says a
 * capability is absent in one sentence and present in another should not be
 * silently treated as a denial.
 */
export function isNegated(
  text: string,
  term: string,
  windowChars: number = DEFAULT_WINDOW_CHARS,
): boolean {
  const haystack = stripMarkup(text).toLowerCase();
  const needle = term.toLowerCase();

  const occurrences: number[] = [];
  let from = 0;
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    occurrences.push(at);
    from = at + needle.length;
  }
  if (occurrences.length === 0) return false;

  return occurrences.every((at) =>
    occurrenceIsNegated(haystack, at, needle.length, windowChars),
  );
}

function occurrenceIsNegated(
  haystack: string,
  at: number,
  length: number,
  windowChars: number,
): boolean {
  const before = haystack.slice(Math.max(0, at - windowChars), at);
  const after = haystack.slice(at + length, at + length + windowChars);

  for (const trigger of PRE_NEGATION_TRIGGERS) {
    const triggerAt = before.lastIndexOf(trigger);
    if (triggerAt === -1) continue;

    const between = before.slice(triggerAt + trigger.length);

    // A pseudo-trigger looks like negation but is not.
    const contextStart = Math.max(0, triggerAt - 12);
    const context = before.slice(contextStart, triggerAt + trigger.length + 8);
    if (PSEUDO_TRIGGERS.some((p) => context.includes(p))) continue;

    // Scope ends at a clause boundary.
    if (SCOPE_TERMINATORS.some((t) => between.includes(t))) continue;

    return true;
  }

  for (const trigger of POST_NEGATION_TRIGGERS) {
    const triggerAt = after.indexOf(trigger);
    if (triggerAt === -1) continue;
    const between = after.slice(0, triggerAt);
    if (SCOPE_TERMINATORS.some((t) => between.includes(t))) continue;
    return true;
  }

  return false;
}

/** Returns the terms from `terms` that appear in `text` un-negated. */
export function affirmedTerms(text: string, terms: string[]): string[] {
  const haystack = stripMarkup(text).toLowerCase();
  return terms.filter(
    (term) => haystack.includes(term.toLowerCase()) && !isNegated(text, term),
  );
}
