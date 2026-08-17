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
