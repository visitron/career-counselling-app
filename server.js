/**
 * Dynamic Frontend Generator Server
 * ─────────────────────────────────────────────────────────────
 * Accepts POST requests with organization data and dynamically
 * generates and serves frontend files (HTML, CSS, JS) with
 * injected organization-specific values.
 * 
 * Usage:
 *   npm install
 *   npm start
 * 
 * Test:
 *   POST /index.html
 *   Body: {"guid": 1234, "organization_data": {...}}
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const NodeCache = require('node-cache');

// ══════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3001;
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const CACHE_TTL = 600; // 10 minutes

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

const app = express();
const cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 120 });
const ajv = new Ajv();

// Middleware
app.use(express.json());
app.use(requestLogger);

// ══════════════════════════════════════════════════════════════
// JSON SCHEMA VALIDATION
// ══════════════════════════════════════════════════════════════

const organizationDataSchema = {
  type: 'object',
  required: ['guid', 'organization_data'],
  properties: {
    guid: { type: [
      'number',
      'string'
    ] },
    organization_data: {
      type: 'object',
      required: ['institution_name', 'institution_app_title', 'institution_app_subtitle'],
      properties: {
        institution_name: { type: 'string', minLength: 1 },
        institution_app_title: { type: 'string', minLength: 1 },
        institution_app_subtitle: { type: 'string', minLength: 1 },
        institution_logo_link: { type: 'string' },
        institution_theme_color_hex: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

const validate = ajv.compile(organizationDataSchema);

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  const body = req.body;
  
  console.log(`[${timestamp}] ${method} ${path}`);
  if (body && body.guid) {
    console.log(`  → Organization GUID: ${body.guid}`);
  }
  
  next();
}

/**
 * Load template from disk
 */
function loadTemplate(filename) {
  try {
    const filePath = path.join(TEMPLATES_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      error: `Failed to load template '${filename}': ${err.message}`
    };
  }
}

/**
 * Replace placeholders in content
 * Supports {{placeholder}} syntax
 */
function replacePlaceholders(content, replacements) {
  let result = content;
  
  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    const regex = new RegExp(placeholder, 'g');
    result = result.replace(regex, String(value));
  }
  
  return result;
}

/**
 * Generate cache key
 */
function getCacheKey(guid, fileType) {
  return `${guid}-${fileType}`;
}

/**
 * Validate and prepare organization data
 */
function prepareReplacements(data) {
  const org = data.organization_data;
  
  // Set default theme color if not provided
  const themeColor = org.institution_theme_color_hex || '#3d5afe';
  
  return {
    guid: data.guid,
    institution_name: org.institution_name || 'Institution',
    institution_app_title: org.institution_app_title || 'Counselling App',
    institution_app_subtitle: org.institution_app_subtitle || 'Psychometric assessments',
    institution_logo_link: org.institution_logo_link || '🎓',
    institution_theme_color_hex: themeColor
  };
}

/**
 * Generate complete app (HTML + embedded CSS + embedded JS)
 */
function generateCompleteApp(guid, replacements) {
  const cacheKey = `${guid}-complete-app.html`;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`  → Cache HIT for ${cacheKey}`);
    return { success: true, content: cached };
  }
  
  // Load all 3 templates
  const htmlResult = loadTemplate('index.html.template');
  const cssResult = loadTemplate('styles.css.template');
  const jsResult = loadTemplate('script.js.template');
  
  if (!htmlResult.success) {
    return { success: false, error: htmlResult.error };
  }
  if (!cssResult.success) {
    return { success: false, error: cssResult.error };
  }
  if (!jsResult.success) {
    return { success: false, error: jsResult.error };
  }
  
  // Replace placeholders in all templates
  let htmlContent = replacePlaceholders(htmlResult.content, replacements);
  const cssContent = replacePlaceholders(cssResult.content, replacements);
  const jsContent = replacePlaceholders(jsResult.content, replacements);
  
  // Inject CSS into <head> before </head>
  const styleTag = `<style>\n${cssContent}\n</style>`;
  htmlContent = htmlContent.replace('</head>', `  ${styleTag}\n</head>`);
  
  // Inject JS before </body>
  const scriptTag = `<script>\n${jsContent}\n</script>`;
  htmlContent = htmlContent.replace('</body>', `  ${scriptTag}\n</body>`);
  
  // Cache the complete result
  cache.set(cacheKey, htmlContent);
  console.log(`  → Cache SET for ${cacheKey} (TTL: ${CACHE_TTL}s)`);
  
  return { success: true, content: htmlContent };
}

/**
 * Send error response
 */
function sendError(res, statusCode, message, details = null) {
  const response = {
    success: false,
    message: message
  };
  
  if (details) {
    response.details = details;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Send success response with file
 */
function sendFile(res, content, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(content);
}

// ══════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/generate-app
 * Generate and return complete HTML with embedded CSS and JavaScript
 */
app.post('/api/generate-app', (req, res) => {
  console.log('\n📦 Generating complete app (HTML + CSS + JS)');
  
  // Validate request body
  if (!validate(req.body)) {
    console.log('  ✗ Validation failed');
    return sendError(res, 400, 'Invalid request body', validate.errors);
  }
  
  try {
    const replacements = prepareReplacements(req.body);
    const result = generateCompleteApp(req.body.guid, replacements);
    
    if (!result.success) {
      console.log(`  ✗ Generation failed: ${result.error}`);
      return sendError(res, 500, 'Failed to generate app', result.error);
    }
    
    console.log('  ✓ Generated successfully');
    sendFile(res, result.content, 'text/html; charset=utf-8');
  } catch (err) {
    console.error('  ✗ Server error:', err.message);
    sendError(res, 500, 'Internal server error', err.message);
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: {
      keys: cache.keys().length,
      ttl: CACHE_TTL
    }
  });
});

/**
 * GET /cache/stats
 * Cache statistics
 */
app.get('/cache/stats', (req, res) => {
  const keys = cache.keys();
  const stats = {};
  
  keys.forEach(key => {
    stats[key] = {
      ttl: cache.getTtl(key) - Date.now(),
      hits: 'N/A' // node-cache doesn't track hits by default
    };
  });
  
  res.json({
    totalKeys: keys.length,
    items: stats,
    globalTTL: CACHE_TTL
  });
});

/**
 * DELETE /cache/clear
 * Clear all cache
 */
app.delete('/cache/clear', (req, res) => {
  const clearedKeys = cache.keys();
  cache.flushAll();
  console.log(`\n🗑️  Cache cleared (${clearedKeys.length} items removed)`);
  res.json({
    success: true,
    message: `Cleared ${clearedKeys.length} cached items`,
    clearedKeys: clearedKeys
  });
});

/**
 * 404 Handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    hint: 'Available endpoints: POST /api/generate-app, GET /health, GET /cache/stats, DELETE /cache/clear'
  });
});

/**
 * Error Handler
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  sendError(res, 500, 'Internal server error', err.message);
});

// ══════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Dynamic Frontend Generator Server                  ║');
  console.log(`║        Running on http://localhost:${PORT}                    ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                               ║');
  console.log('║    POST /api/generate-app - Generate complete app        ║');
  console.log('║    GET  /health           - Health check                 ║');
  console.log('║    GET  /cache/stats      - Cache statistics             ║');
  console.log('║    DELETE /cache/clear    - Clear cache                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
