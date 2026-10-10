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
  [/Ï /g, 'ρ'],
  [/Î¸/g, 'θ'],
  [/Î»/g, 'λ'],
  [/Î±/g, 'α'],
  [/Î²/g, 'β'],
  [/Î”|âˆ†/g, 'Δ'],
  [/Ï‰/g, 'ω'],
  [/â†’/g, '→'],
  [/â‡’/g, '⇒'],
  [/âˆš/g, '√'],
  [/Â±/g, '±'],
  [/Ã—/g, '×'],
  [/Â°/g, '°'],
  [/Ï€/g, 'π'],
  [/Î©/g, 'Ω'],
  [/â‰ /g, '≠'],
  [/â‰ˆ/g, '≈'],
  [/âˆ∝/g, '∝'],
  [/â„«/g, 'Å'],
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

function normalizeMathSymbols(value: string) {
  return value
    .replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\leftrightarrow\b/g, '↔')
    .replace(/\\rightleftharpoons\b/g, '⇌')
    .replace(/\\Rightarrow\b/g, '⇒')
    .replace(/\\Leftarrow\b/g, '⇐')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\neq\b|\\ne\b/g, '≠')
    .replace(/\\pm\b/g, '±')
    .replace(/\\mp\b/g, '∓')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\leq\b|\\le\b/g, '≤')
    .replace(/\\geq\b|\\ge\b/g, '≥')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\degree\b|\\circ\b/g, '°')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\rho\b/g, 'ρ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\tau\b/g, 'τ')
    .replace(/\\phi\b|\\varphi\b/g, 'φ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\Omega\b/g, 'Ω')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\epsilon\b|\\varepsilon\b/g, 'ε');
}

function normalizeVectors(value: string) {
  return value
    .replace(/([A-Za-zΑ-Ωα-ω])[\u20D7\u20D1\u20D6]/g, (_, letter) => `\\vec{${letter}}`)
    .replace(/\\overrightarrow\{([^}]+)\}/g, (_, letter) => `\\vec{${letter}}`)
    .replace(/\\vec\s+([A-Za-zΑ-Ωα-ω0-9])/g, (_, letter) => `\\vec{${letter}}`)
    .replace(/([A-Za-zΑ-Ωα-ω])\u0302/g, (_, letter) => `\\hat{${letter}}`)
    .replace(/\\hat\s+([A-Za-zΑ-Ωα-ω0-9])/g, (_, letter) => `\\hat{${letter}}`)
    .replace(/(^|[^A-Za-z0-9])î(?=[^A-Za-z0-9]|$)/g, '$1\\hat{i}')
    .replace(/(^|[^A-Za-z0-9])ĵ(?=[^A-Za-z0-9]|$)/g, '$1\\hat{j}');
}

export function normalizeExamText(value: string) {
  if (!value) return '';
  return normalizeVectors(
    normalizeMathSymbols(
      normalizeGreekZero(
        normalizeInlinePowers(
          normalizeDimensionBrackets(
            repairMojibake(value),
          ),
        ),
      ),
    ),
  );
}

export function formatExamTextForDisplay(value: string) {
  return normalizeExamText(value);
}

export interface ExamTextSegment {
  type: 'text' | 'vector' | 'hat';
  content: string;
}

export function parseExamTextSegments(rawText: string): ExamTextSegment[] {
  if (!rawText) return [];
  const normalized = formatExamTextForDisplay(rawText);

  // Match \vec{...}, or raw combining arrow, or \hat{...}, or raw combining circumflex
  const tokenRegex = /(\\vec\{[A-Za-z0-9Α-Ωα-ω]+\}|[A-Za-zΑ-Ωα-ω][\u20D7\u20D1\u20D6]|\\hat\{[A-Za-z0-9Α-Ωα-ω]+\}|[A-Za-zΑ-Ωα-ω]\u0302)/g;
  const segments: ExamTextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: normalized.substring(lastIndex, match.index),
      });
    }

    const token = match[0];
    if (token.startsWith('\\vec{')) {
      segments.push({
        type: 'vector',
        content: token.slice(5, -1),
      });
    } else if (token.endsWith('\u20D7') || token.endsWith('\u20D1') || token.endsWith('\u20D6')) {
      segments.push({
        type: 'vector',
        content: token[0] ?? '',
      });
    } else if (token.startsWith('\\hat{')) {
      segments.push({
        type: 'hat',
        content: token.slice(5, -1),
      });
    } else if (token.endsWith('\u0302')) {
      segments.push({
        type: 'hat',
        content: token[0] ?? '',
      });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < normalized.length) {
    segments.push({
      type: 'text',
      content: normalized.substring(lastIndex),
    });
  }

  return segments;
}
