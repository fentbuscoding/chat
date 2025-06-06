// src/lib/SafeCSS.ts

// Whitelist of allowed CSS properties
const ALLOWED_CSS_PROPERTIES = [
  // Layout & Positioning
  'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'display', 'flex-direction', 'justify-content', 'align-items', 'align-content',
  'flex-wrap', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis',
  'grid', 'grid-template-columns', 'grid-template-rows', 'grid-gap', 'gap',
  
  // Sizing
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  
  // Spacing
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  
  // Typography
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'text-decoration', 'text-transform', 'letter-spacing',
  'word-spacing', 'text-shadow', 'text-indent',
  
  // Colors & Backgrounds
  'color', 'background', 'background-color', 'background-image',
  'background-position', 'background-size', 'background-repeat',
  'background-attachment', 'background-clip', 'background-origin',
  
  // Borders
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  
  // Visual Effects
  'opacity', 'visibility', 'overflow', 'overflow-x', 'overflow-y',
  'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
  'transform', 'transform-origin',
  
  // Transitions & Animations (limited)
  'transition', 'transition-property', 'transition-duration',
  'transition-timing-function', 'transition-delay',
  
  // Misc
  'cursor', 'pointer-events', 'user-select', 'object-fit', 'object-position'
];

// CSS functions that are allowed
const ALLOWED_CSS_FUNCTIONS = [
  'rgb', 'rgba', 'hsl', 'hsla', 'linear-gradient', 'radial-gradient',
  'scale', 'rotate', 'translate', 'translateX', 'translateY', 'translateZ',
  'skew', 'skewX', 'skewY', 'matrix', 'perspective',
  'blur', 'brightness', 'contrast', 'grayscale', 'hue-rotate',
  'invert', 'saturate', 'sepia', 'drop-shadow'
];

// Dangerous patterns to remove
const DANGEROUS_PATTERNS = [
  // External URLs
  /url\s*\(\s*['"]?(?!data:)[^'")]*['"]?\s*\)/gi,
  // JavaScript expressions
  /expression\s*\(/gi,
  /javascript:/gi,
  /vbscript:/gi,
  // @import statements
  /@import/gi,
  // CSS injection attempts
  /\/\*[\s\S]*?\*\//g, // Remove all comments
];

// Maximum CSS length to prevent abuse
const MAX_CSS_LENGTH = 10000; // 10KB limit

/**
 * Sanitizes CSS to prevent XSS attacks and ensure safe styling
 */
export function sanitizeCSS(css: string): string {
  if (!css || typeof css !== 'string') {
    return '';
  }

  // Check length limit
  if (css.length > MAX_CSS_LENGTH) {
    console.warn('CSS exceeds maximum length, truncating');
    css = css.substring(0, MAX_CSS_LENGTH);
  }

  // Remove dangerous patterns
  let sanitized = css;
  DANGEROUS_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Parse and validate CSS rules
  try {
    const rules = parseCSS(sanitized);
    const validRules = rules.filter(rule => isValidCSSRule(rule));
    return validRules.join('\n');
  } catch (error) {
    console.error('CSS parsing error:', error);
    return '';
  }
}

/**
 * Parse CSS into individual rules
 */
function parseCSS(css: string): string[] {
  const rules: string[] = [];
  const ruleRegex = /([^{]+)\{([^}]+)\}/g;
  let match;

  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim();
    const declarations = match[2].trim();
    
    if (isValidSelector(selector) && isValidDeclarations(declarations)) {
      rules.push(`${selector} { ${declarations} }`);
    }
  }

  return rules;
}

/**
 * Validate CSS selector
 */
function isValidSelector(selector: string): boolean {
  // Only allow class selectors for profile card elements
  const allowedSelectors = [
    '.profile-card-container',
    '.profile-avatar',
    '.profile-display-name',
    '.profile-username',
    '.profile-bio',
    '.profile-divider'
  ];

  // Allow pseudo-classes and pseudo-elements on allowed selectors
  const selectorPattern = /^(\.profile-[a-z-]+)(:?[a-z-]*)?$/;
  
  return allowedSelectors.some(allowed => 
    selector === allowed || 
    selector.startsWith(allowed + ':') ||
    selector.startsWith(allowed + '::')
  );
}

/**
 * Validate CSS declarations
 */
function isValidDeclarations(declarations: string): boolean {
  const declarationList = declarations.split(';');
  
  return declarationList.every(declaration => {
    if (!declaration.trim()) return true;
    
    const [property, value] = declaration.split(':').map(s => s.trim());
    
    if (!property || !value) return false;
    
    return isValidProperty(property) && isValidValue(value);
  });
}

/**
 * Check if CSS property is allowed
 */
function isValidProperty(property: string): boolean {
  return ALLOWED_CSS_PROPERTIES.includes(property.toLowerCase());
}

/**
 * Check if CSS value is safe
 */
function isValidValue(value: string): boolean {
  // Remove quotes and whitespace for checking
  const cleanValue = value.replace(/['"`]/g, '').trim().toLowerCase();
  
  // Block dangerous keywords
  const dangerousKeywords = [
    'expression', 'javascript', 'vbscript', '@import', 'behavior'
  ];
  
  if (dangerousKeywords.some(keyword => cleanValue.includes(keyword))) {
    return false;
  }
  
  // If value contains function calls, validate them
  const functionMatch = cleanValue.match(/([a-z-]+)\s*\(/g);
  if (functionMatch) {
    return functionMatch.every(func => {
      const funcName = func.replace(/\s*\($/, '');
      return ALLOWED_CSS_FUNCTIONS.includes(funcName);
    });
  }
  
  return true;
}

/**
 * Get default profile card CSS
 */
export function getDefaultProfileCSS(): string {
  return `
/* You can customize your profile card here! */
/* Allowed selectors: .profile-card-container, .profile-avatar, .profile-display-name, .profile-username, .profile-bio, .profile-divider */

.profile-card-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 20px;
}

.profile-avatar {
  border-radius: 50%;
  width: 80px;
  height: 80px;
}

.profile-display-name {
  font-size: 24px;
  font-weight: bold;
  color: white;
}

.profile-username {
  font-size: 14px;
  opacity: 0.8;
  color: white;
}

.profile-bio {
  font-size: 14px;
  color: white;
  margin-top: 10px;
}
  `.trim();
}

/**
 * Check if CSS rule is valid
 */
function isValidCSSRule(rule: string): boolean {
  return rule.trim().length > 0;
}