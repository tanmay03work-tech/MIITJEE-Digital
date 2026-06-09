const mojibakeReplacements: Array<[RegExp, string]> = [
  [/Â²/g, '²'],
  [/Â³/g, '³'],
  [/â‰¤/g, '≤'],
  [/â‰¥/g, '≥'],
  [/âˆž/g, '∞'],
  [/âˆ’/g, '−'],
  [/â€“|â€”/g, '-'],
  [/â‹…/g, '·'],
  [/Î¼|Âµ/g, 'μ'],
  [/Ï/g, 'ρ'],
  [/Î¸/g, 'θ'],
  [/Î»/g, 'λ'],
  [/Î±/g, 'α'],
  [/Î²/g, 'β'],
  [/Î”|âˆ†/g, 'Δ'],
  [/Ï‰/g, 'ω'],
];

function repairMojibake(value: string) {
  return mojibakeReplacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function normalizeDimensionExpression(expression: string) {
  return expression
    .replace(/\s+/g, '')
    .replace(/([A-Za-zΑ-Ωα-ωμΩ])(-?\d+)(?=[A-Za-zΑ-Ωα-ωμΩ]|$)/g, '$1^$2');
}

function normalizeDimensionBrackets(value: string) {
  return value.replace(/\[([^[\]]+)\]/g, (_, expression: string) => `[${normalizeDimensionExpression(expression)}]`);
}

function normalizeInlinePowers(value: string) {
  return value.replace(
    /(^|[^A-Za-z0-9])([A-Za-zΑ-Ωα-ωμΩ])([23])(?=\s*(?:[/=+*\-),\].:;]))/g,
    '$1$2^$3',
  );
}

function normalizeGreekZero(value: string) {
  return value.replace(/([μρλθω])o\b/gi, '$10');
}

export function normalizeExamText(value: string) {
  return normalizeGreekZero(
    normalizeInlinePowers(
      normalizeDimensionBrackets(
        repairMojibake(value),
      ),
    ),
  );
}

export function formatExamTextForDisplay(value: string) {
  return normalizeExamText(value);
}
