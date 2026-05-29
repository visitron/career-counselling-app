/**
 * Dynamic Frontend Generator Server
 * ─────────────────────────────────────────────────────────────
 * Multi-application server supporting dynamic frontend generation with
 * license management integration. Accepts POST requests with organization
 * data and generates application-specific HTML with injected values.
 * 
 * Response Format:
 *   - Success (200): Plain HTML only (no JSON wrapper)
 *   - Errors (400/500): JSON with error details
 * 
 * Supports multiple applications:
 *   - app_id: 1 = Career Counselling App
 *   - app_id: 2 = Contact App
 * 
 * Usage:
 *   npm install
 *   npm start
 * 
 * Test (Career Counselling App):
 *   POST /api/generate-app
 *   Body: {
 *     "guid": 5678,
 *     "app_id": 1,
 *     "spreadsheet_url": "https://docs.google.com/spreadsheets/d/1PEEraFJLV1Iw984n2VlZIgztF8iDrYODN9Ndads/",
 *     "organization_data": {...}
 *   }
 * 
 * Test (Contact App):
 *   POST /api/generate-app
 *   Body: {
 *     "guid": 5678,
 *     "app_id": 2,
 *     "spreadsheet_url": "https://docs.google.com/spreadsheets/d/1PEEraFJLV1Iw984n2VlZIgztF8iDrYODN9Ndads/",
 *     "organization_data": {...}
 *   }
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
const CACHE_TTL = 600; // 10 minutes (in seconds)

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

const app = express();
const cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 120 });
const ajv = new Ajv({ allowUnionTypes: true });

// Middleware
app.use(express.json());
app.use(requestLogger);

// ══════════════════════════════════════════════════════════════
// APPLICATION CONFIGURATION
// ══════════════════════════════════════════════════════════════

const APP_CONFIG = {
  1: {
    name: 'Career Counselling',
    templatesDir: 'application/career counselling app - template',
    files: ['index.html.template', 'script.js.template', 'styles.css.template']
  },
  2: {
    name: 'Contact',
    templatesDir: 'application/contact app',
    files: ['index_v2.html']
  }
};

// ══════════════════════════════════════════════════════════════
// JSON SCHEMA VALIDATION
// ══════════════════════════════════════════════════════════════

/**
 * Validates Google Sheets URL format
 * Pattern: https://docs.google.com/spreadsheets/d/{spreadsheet_id}/[optional_path]
 */
function isValidGoogleSheetsUrl(url) {
  const googleSheetsPattern = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+\/?/;
  return googleSheetsPattern.test(url);
}

const organizationDataSchema = {
  type: 'object',
  required: ['guid', 'app_id', 'spreadsheet_url', 'organization_data'],
  properties: {
    guid: { 
      type: ['number', 'string'],
      description: 'Organization/institution identifier'
    },
    app_id: {
      type: 'number',
      enum: [1, 2],
      description: '1 = Career Counselling App, 2 = Contact App'
    },
    spreadsheet_url: {
      type: 'string',
      description: 'Google Sheets URL for organization-specific data',
      pattern: '^https://docs\\.google\\.com/spreadsheets/d/[a-zA-Z0-9_-]+/?'
    },
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
    if (body.app_id) {
      console.log(`  → App ID: ${body.app_id} (${APP_CONFIG[body.app_id]?.name || 'Unknown'})`);
    }
    if (body.spreadsheet_url) {
      console.log(`  → Spreadsheet URL: ${body.spreadsheet_url}`);
    }
  }
  
  next();
}

/**
 * Load template from disk with app-specific path resolution
 * @param {string} filename - Template filename to load
 * @param {number} appId - Application ID (determines template directory)
 */
function loadTemplate(filename, appId) {
  try {
    const appConfig = APP_CONFIG[appId];
    if (!appConfig) {
      return {
        success: false,
        error: `Unsupported app_id: ${appId}`
      };
    }
    
    const filePath = path.join(__dirname, appConfig.templatesDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`  → Template loaded: app_id=${appId}, file=${filename}`);
    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      error: `Failed to load template '${filename}' for app_id ${appId}: ${err.message}`
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
 * Generate cache key with app_id isolation
 * Format: ${guid}-${appId}-${fileType}
 */
function getCacheKey(guid, appId, fileType) {
  return `${guid}-${appId}-${fileType}`;
}

/**
 * Validate and prepare organization data with spreadsheet URL
 */
function prepareReplacements(data) {
  const org = data.organization_data;
  
  // Set default theme color if not provided
  const themeColor = org.institution_theme_color_hex || '#3d5afe';
  
  return {
    guid: data.guid,
    app_id: data.app_id,
    spreadsheet_url: data.spreadsheet_url,
    SPREADSHEET_URL: data.spreadsheet_url,
    institution_name: org.institution_name || 'Institution',
    institution_app_title: org.institution_app_title || 'Counselling App',
    institution_app_subtitle: org.institution_app_subtitle || 'Psychometric assessments',
    institution_logo_link: org.institution_logo_link || '🎓',
    institution_theme_color_hex: themeColor
  };
}

/**
 * Generate complete app with dynamic template loading based on app_id
 * Career Counselling App: Loads and combines 3 separate template files
 * Contact App: Loads single HTML file with embedded CSS and JS
 */
function generateCompleteApp(guid, appId, replacements) {
  // Validate app_id
  if (!APP_CONFIG[appId]) {
    return {
      success: false,
      error: `Unsupported app_id: ${appId}. Valid values: 1 (Career Counselling), 2 (Contact App)`,
      statusCode: 400
    };
  }
  
  const cacheKey = getCacheKey(guid, appId, 'complete-app.html');
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    const ttl = cache.getTtl(cacheKey) - Date.now();
    console.log(`  → Cache HIT for ${cacheKey} (TTL: ${Math.round(ttl / 1000)}s)`);
    return { success: true, content: cached, cached: true };
  }
  
  const appConfig = APP_CONFIG[appId];
  const files = appConfig.files;
  
  // Load all required template files
  const loadedTemplates = {};
  for (const filename of files) {
    const result = loadTemplate(filename, appId);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        statusCode: 500
      };
    }
    loadedTemplates[filename] = result.content;
  }
  
  // Process based on app type
  let htmlContent;
  
  if (appId === 1) {
    // Career Counselling App: Combine 3 templates
    let html = replacePlaceholders(loadedTemplates['index.html.template'], replacements);
    const css = replacePlaceholders(loadedTemplates['styles.css.template'], replacements);
    const js = replacePlaceholders(loadedTemplates['script.js.template'], replacements);
    
    // Inject CSS into <head> before </head>
    const styleTag = `<style>\n${css}\n</style>`;
    html = html.replace('</head>', `  ${styleTag}\n</head>`);
    
    // Inject JS before </body>
    const scriptTag = `<script>\n${js}\n</script>`;
    html = html.replace('</body>', `  ${scriptTag}\n</body>`);
    
    htmlContent = html;
  } else if (appId === 2) {
    // Contact App: Single file (already has embedded CSS/JS)
    htmlContent = replacePlaceholders(loadedTemplates['index_v2.html'], replacements);
  }
  
  // Cache the complete result
  cache.set(cacheKey, htmlContent);
  console.log(`  → Cache SET for ${cacheKey} (TTL: ${CACHE_TTL}s)`);
  
  return { success: true, content: htmlContent, cached: false };
}

/**
 * Send error response (JSON only)
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
 * Send success response (plain HTML only, no JSON wrapper)
 */
function sendHTML(res, content) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(content);
}

// ══════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/generate-app
 * Generate and return complete application with organization-specific customization
 * Returns plain HTML for success, JSON for errors
 */
app.post('/api/generate-app', (req, res) => {
  console.log('\n📦 Generating application');
  
  // Validate request body
  if (!validate(req.body)) {
    console.log('  ✗ Validation failed');
    const errorDetails = validate.errors.map(err => ({
      field: err.instancePath || err.schemaPath,
      message: err.message
    }));
    return sendError(res, 400, 'Invalid request body', errorDetails);
  }
  
  // Additional validation: Google Sheets URL format
  if (!isValidGoogleSheetsUrl(req.body.spreadsheet_url)) {
    console.log('  ✗ Invalid spreadsheet_url format');
    return sendError(res, 400, 'Invalid spreadsheet_url format', {
      received: req.body.spreadsheet_url,
      expected: 'Must be a valid Google Sheets URL (https://docs.google.com/spreadsheets/d/...)'
    });
  }
  
  try {
    const appId = req.body.app_id;
    const guid = req.body.guid;
    
    const replacements = prepareReplacements(req.body);
    const result = generateCompleteApp(guid, appId, replacements);
    
    if (!result.success) {
      const statusCode = result.statusCode || 500;
      console.log(`  ✗ Generation failed: ${result.error}`);
      return sendError(res, statusCode, 'Failed to generate app', result.error);
    }
    
    console.log(`  ✓ Generated successfully (app_id: ${appId}, cached: ${result.cached})`);
    
    // Return plain HTML only
    sendHTML(res, result.content);
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
 * Cache statistics with breakdown by app_id
 */
app.get('/cache/stats', (req, res) => {
  const keys = cache.keys();
  const stats = {};
  const byAppId = {};
  
  // Initialize app_id counters
  Object.keys(APP_CONFIG).forEach(appId => {
    byAppId[appId] = 0;
  });
  
  keys.forEach(key => {
    stats[key] = {
      ttl: cache.getTtl(key) - Date.now(),
      hits: 'N/A' // node-cache doesn't track hits by default
    };
    
    // Extract app_id from cache key (format: guid-appId-fileType)
    const parts = key.split('-');
    if (parts.length >= 2) {
      const appId = parts[1];
      if (APP_CONFIG[appId]) {
        byAppId[appId]++;
      }
    }
  });
  
  res.json({
    totalKeys: keys.length,
    byAppId: byAppId,
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
  console.log('║   Dynamic Frontend Generator Server (Multi-Application)   ║');
  console.log(`║   Running on http://localhost:${PORT}                         ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Supported Applications:                                  ║');
  console.log('║    1 = Career Counselling App                             ║');
  console.log('║    2 = Contact App                                        ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                               ║');
  console.log('║    POST /api/generate-app - Generate complete app        ║');
  console.log('║    GET  /health           - Health check                 ║');
  console.log('║    GET  /cache/stats      - Cache statistics             ║');
  console.log('║    DELETE /cache/clear    - Clear cache                  ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Example Request (Career Counselling App - app_id: 1):   ║');
  console.log('║    POST /api/generate-app                                 ║');
  console.log('║    Content-Type: application/json                         ║');
  console.log('║    {                                                      ║');
  console.log('║      "guid": 5678,                                        ║');
  console.log('║      "app_id": 1,                                         ║');
  console.log('║      "spreadsheet_url":                                   ║');
  console.log('║        "https://docs.google.com/spreadsheets/d/...",     ║');
  console.log('║      "organization_data": {                               ║');
  console.log('║        "institution_name": "Example School",              ║');
  console.log('║        "institution_app_title": "Career App",             ║');
  console.log('║        "institution_app_subtitle": "Explore careers...",  ║');
  console.log('║        "institution_logo_link": "🎓",                     ║');
  console.log('║        "institution_theme_color_hex": "#3d5afe"           ║');
  console.log('║      }                                                    ║');
  console.log('║    }                                                      ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Example Request (Contact App - app_id: 2):              ║');
  console.log('║    Same format as above, but "app_id": 2                  ║');
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
