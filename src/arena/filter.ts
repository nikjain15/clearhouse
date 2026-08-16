/**
 * Content filtering for arena submissions.
 *
 * Submission content is filtered BEFORE it renders on the board. The board is
 * on a projector in a room full of people, so the filter exists to keep what
 * reaches the screen from being something nobody wants projected, and to strip
 * the shapes that are trying to be instructions rather than evidence.
 *
 * This is a rendering control. It is NOT the injection defense: that is the
 * untrusted-content envelope and the constrained finding schema in the model
 * client, which hold whether or not this filter catches anything. Treating a
 * keyword filter as an injection defense is how people get injected.
 */

export interface FilterResult {
  clean: boolean;
  reasons: string[];
  /** Safe to render. Instruction-shaped markup is neutralized, not deleted. */
  rendered: string;
}

const MAX_CHARS = () => Number(process.env.CLEARHOUSE_ARENA_MAX_CHARS ?? 4000);

/** Shapes that exist to be executed rather than read. */
const INSTRUCTION_SHAPES: Array<[RegExp, string]> = [
  [/<!--[\s\S]*?-->/g, 'HTML comment'],
  [/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, 'script tag'],
  [/<\s*\/?\s*(iframe|object|embed|style|link|meta)[^>]*>/gi, 'embedded markup'],
  [/\bon[a-z]+\s*=\s*["'][^"']*["']/gi, 'inline event handler'],
  [/javascript:/gi, 'javascript protocol'],
  [/data:text\/html/gi, 'data URL'],
];

/** Slur and abuse screening is deliberately minimal and conservative here. */
const BLOCKED = [/\bkill yourself\b/i, /\bn[i1]gg/i, /\bfagg/i, /\bkike\b/i, /\bretard(ed)?\b/i];

export function filterSubmission(raw: string): FilterResult {
  const reasons: string[] = [];
  let text = raw ?? '';

  if (text.length > MAX_CHARS()) {
    reasons.push(`Truncated at ${MAX_CHARS()} characters.`);
    text = text.slice(0, MAX_CHARS());
  }

  for (const pattern of BLOCKED) {
    if (pattern.test(text)) {
      return {
        clean: false,
        reasons: ['Submission contains abusive content and was not accepted.'],
        rendered: '',
      };
    }
  }

  // Neutralize rather than delete. An attack that used a hidden HTML comment is
  // interesting, and deleting it would hide the most instructive part of the
  // submission from the room watching the board.
  for (const [pattern, label] of INSTRUCTION_SHAPES) {
    if (pattern.test(text)) {
      reasons.push(`Neutralized ${label} before rendering.`);
      text = text.replace(pattern, (m) => `[${label}, neutralized: ${m.slice(0, 120).replace(/[<>]/g, '')}]`);
    }
  }

  // Escape anything left, so nothing reaches the DOM as markup.
  const rendered = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return { clean: true, reasons, rendered };
}

/** Handles are shown on the board, so they get the same treatment, shorter. */
export function filterHandle(raw: string): string {
  return (raw ?? '')
    .slice(0, 40)
    .replace(/[^\w \-.]/g, '')
    .trim() || 'anonymous';
}
