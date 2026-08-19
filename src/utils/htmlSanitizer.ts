/**
 * HTML sanitizer for EPUB content.
 * Strips dangerous tags/attributes to prevent XSS attacks.
 * Requirements: 12.5, 12.6
 */

/**
 * Tags that are completely removed along with their content.
 */
const BLOCKED_TAGS_WITH_CONTENT = [
  'script',
  'style', // inline styles replaced by our own CSS
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link', // external stylesheets
  'meta',
  'base',
];

/**
 * Tags whose element is removed but whose inner content is preserved.
 */
const BLOCKED_TAGS_KEEP_CONTENT = [
  'noscript',
  'canvas',
  'svg',
  'math',
  'audio',
  'video',
  'source',
  'track',
  'map',
  'area',
];

/**
 * Attributes that are stripped from every element.
 */
const BLOCKED_ATTRIBUTES = [
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmousemove',
  'onmouseout',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onload',
  'onunload',
  'onabort',
  'onerror',
  'onfocus',
  'onblur',
  'onchange',
  'onsubmit',
  'onreset',
  'onselect',
  'onscroll',
  'oninput',
  'oncontextmenu',
  'onwheel',
  'ondrag',
  'ondrop',
  'onpaste',
  'oncopy',
  'oncut',
  'srcdoc',
  'formaction',
  'action',
  'data', // <object data="...">
];

/**
 * Sanitize raw HTML from an EPUB file.
 *
 * - Removes dangerous tags (script, iframe, form, etc.)
 * - Strips all event handler attributes (onclick, onload, …)
 * - Rewrites javascript: hrefs/srcs to "#"
 * - Removes data: URIs from src/href (except images — kept as-is for EPUB covers)
 *
 * This is a regex-based sanitizer suitable for the controlled EPUB context.
 * For a production app, consider a proper HTML parser.
 */
export function sanitizeEPUBHtml(html: string): string {
  let sanitized = html;

  // 1. Remove blocked tags WITH their content (script, style, iframe, …)
  for (const tag of BLOCKED_TAGS_WITH_CONTENT) {
    // Remove opening + content + closing (non-greedy, case-insensitive, dotall)
    const withContent = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi');
    const selfClosing = new RegExp(`<${tag}[^>]*\\/?>`, 'gi');
    sanitized = sanitized.replace(withContent, '');
    sanitized = sanitized.replace(selfClosing, '');
  }

  // 2. Remove blocked tags but KEEP their inner content
  for (const tag of BLOCKED_TAGS_KEEP_CONTENT) {
    const openTag = new RegExp(`<${tag}[^>]*>`, 'gi');
    const closeTag = new RegExp(`<\\/${tag}>`, 'gi');
    sanitized = sanitized.replace(openTag, '');
    sanitized = sanitized.replace(closeTag, '');
  }

  // 3. Strip event handler attributes from all remaining tags
  for (const attr of BLOCKED_ATTRIBUTES) {
    // Matches: attr="...", attr='...', attr=value (no quotes)
    const attrPattern = new RegExp(`\\s${attr}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]*)`, 'gi');
    sanitized = sanitized.replace(attrPattern, '');
  }

  // 4. Rewrite javascript: URIs in href/src/action to "#"
  sanitized = sanitized.replace(/(href|src|action)\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, '$1="#"');

  // 5. Remove data: URIs from href (allow data: in src for embedded images)
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*data:[^"'\s>]*/gi, 'href="#"');

  return sanitized;
}
