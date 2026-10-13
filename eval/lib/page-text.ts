// Visible text of a generated page, for statistics only. The HTML is parsed as data with
// node-html-parser; it is never loaded into a browser, so no script on the page can run.
import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser'

/** Elements whose content is never shown as page text. */
const HIDDEN = new Set(['head', 'script', 'style', 'noscript', 'template', 'iframe', 'object'])

const BLOCK = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'html',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
  'button',
])

/** Utility classes that hide an element (Tailwind / Bootstrap names). */
const HIDING_CLASSES = new Set(['hidden', 'invisible', 'sr-only', 'visually-hidden'])
const HIDING_STYLE = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|!|$)/i

/**
 * Hidden by an attribute, an inline style or a hiding class. Rules in style sheets are not
 * evaluated (the page is never rendered), so text hidden that way still counts.
 */
function isHidden(node: HTMLElement): boolean {
  if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return true
  if (HIDING_STYLE.test(node.getAttribute('style') ?? '')) return true
  const classes = (node.getAttribute('class') ?? '').split(/\s+/)
  return classes.some((c) => HIDING_CLASSES.has(c))
}

function walk(node: Node, out: string[]): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    out.push(node.text)
    return
  }
  if (!(node instanceof HTMLElement)) return // comments
  const tag = node.rawTagName?.toLowerCase() ?? ''
  if (HIDDEN.has(tag)) return
  // Decoration (e.g. card ordinals "01") and hidden elements carry no statement about the shop.
  if (isHidden(node)) return
  const block = BLOCK.has(tag)
  if (block) out.push('\n')
  for (const child of node.childNodes) walk(child, out)
  if (block) out.push('\n')
}

/** Text a reader would see, one line per block element, whitespace inside a line collapsed. */
export function visibleText(html: string): string {
  // node-html-parser keeps <!doctype …> as a text node.
  const root = parse(html.replace(/<!doctype[^>]*>/gi, ''), { comment: false })
  const out: string[] = []
  walk(root, out)
  return out
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
}
