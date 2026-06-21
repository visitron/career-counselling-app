# Server License Management System

A comprehensive subscription-based license management platform with dynamic app generation. This system validates institutional subscriptions and generates branded web applications on-demand.

## 📋 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SUBSCRIPTION VALIDATION (Nerve Kernel)                      │
│     Google Apps Script API Endpoint                              │
│     • Receives: GET /?iam_guid={guid}                            │
│     • Lookup: Validates GUID in subscription sheet               │
│     • Check: Verify subscription is active (date range)          │
└──────────────┬──────────────────────────────────────────────────┘
               │ Subscription ACTIVE?
               │ YES ↓
┌──────────────────────────────────────────────────────────────────┐
│  2. APP GENERATION REQUEST (Nerve Kernel → Frontend Generator)   │
│     POST to dynamic-frontend-generator-v2.onrender.com           │
│     Payload includes:                                             │
│     • guid, app_id, spreadsheet_url                               │
│     • organization_data (institution name, logo, theme, etc)      │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────────────────────────────────────────────────────────┐
│  3. APP GENERATION (Frontend Generator Server)                   │
│     Node.js Express Server                                        │
│     • Load templates (HTML, CSS, JS)                              │
│     • Inject organization data                                    │
│     • Embed CSS & JavaScript inline                               │
│     • Return complete HTML file                                   │
└──────────────┬──────────────────────────────────────────────────┘
               │
┌──────────────────────────────────────────────────────────────────┐
│  4. RESPONSE TO USER                                              │
│     Complete, self-contained HTML application                    │
│     Ready for immediate deployment                                │
└──────────────────────────────────────────────────────────────────┘
```

## 🏗️ Architecture Components

### 1. Nerve Kernel (Google Apps Script - License Management)
- **Location**: `Nerve kernel/nerve-kernel-backend.gs`
- **Purpose**: Validates institutional subscriptions via GUID lookup
- **Entry Point**: GET endpoint deployed to Google Apps Script
- **Data Source**: Google Sheets (4 interconnected tables)
- **Actions**:
  - Verifies GUID against subscription records
  - Checks subscription start/expiry dates
  - Returns "expired" HTML for inactive subscriptions
  - Triggers app generation for active subscriptions

### 2. Frontend Generator Server (Node.js - App Builder)
- **Location**: `server.js`, `package.json`
- **Purpose**: Generates branded HTML applications with organization data
- **Framework**: Express.js
- **Entry Point**: POST /api/generate-app
- **Features**:
  - Single endpoint, self-contained HTML response
  - Template-based generation (HTML, CSS, JS)
  - In-memory caching (10-minute TTL)
  - JSON schema validation
  - Real-time organization data injection

### 3. Data Model (Google Sheets)
Four interconnected sheets managed in Nerve Kernel spreadsheet:

| Sheet | Purpose | Key Fields |
|-------|---------|-----------|
| **subscription** | License records | subscription_id, iam_guid, institution_app_map_id, subscription_start_date_time, subscription_expiry_date_time, amount_paid, invoice_url |
| **institution_application_map** | Links institutions to apps with customization | institution_app_map_id, institution_id, application_id, password, iam_guid, theme_color_hex, customized_app_description, max_usage_count, actual_usage_count, spreadsheet_link |
| **institution** | Organization information | institution_id, name, address, logo_link |
| **application** | Available applications | application_id (102=Career Counselling, 104=Contact App) |

## 🚀 Complete API Flow

### Request Flow Diagram

```
USER/CLIENT
    │
    │ Access URL with GUID
    │ ↓
NERVE KERNEL (Google Apps Script)
    │
    ├─ Parse iam_guid from query parameter
    │
    ├─ Query subscription sheet for GUID match
    │  └─ If NOT FOUND: Return 404 error
    │
    ├─ Validate subscription dates
    │  ├─ If EXPIRED: Return expiration HTML
    │  └─ If NOT STARTED: Return JSON status
    │
    ├─ Fetch institution_app_map using institution_app_map_id
    │
    ├─ Map application_id to app_id
    │  ├─ 102 → 1 (Career Counselling)
    │  └─ 104 → 2 (Contact App)
    │
    ├─ Fetch institution details (name, logo, address)
    │
    ├─ Parse customized_app_description (title, subtitle)
    │
    └─ POST to Frontend Generator with payload:
        │
        FRONTEND GENERATOR (Node.js Server)
            │
            ├─ Validate request schema
            │
            ├─ Check cache (key: {guid}-complete-app.html)
            │  └─ If HIT: Return cached HTML
            │
            ├─ Load templates (index.html, styles.css, script.js)
            │
            ├─ Inject placeholders:
            │  ├─ {{institution_app_title}} → "Career Counselling"
            │  ├─ {{institution_app_subtitle}} → Description
            │  ├─ {{institution_logo_link}} → Logo emoji/URL
            │  ├─ {{institution_theme_color_hex}} → "#9c27b0"
            │  └─ {{guid}} → GUID for ORGANIZATION_ID in JS
            │
            ├─ Embed CSS in <style> tag
            │
            ├─ Embed JavaScript in <script> tag
            │
            ├─ Cache complete HTML (TTL: 10 minutes)
            │
            └─ Return response:
                │
        NERVE KERNEL (receives response)
            │
            ├─ If status 200/201: Return HTML directly
            │  └─ User receives complete application in browser
            │
            └─ If error: Return error JSON response
```

### Step-by-Step: What Happens When User Accesses App

1. **User accesses URL** (deployed Nerve Kernel endpoint)
   ```
   https://script.google.com/macros/d/{scriptId}/usercontent?iam_guid=924F0004-4BC4-D78F-0000-000000000000
   ```

2. **Nerve Kernel processes request**
   - Searches subscription sheet for GUID
   - Finds: subscription_id=5, institution_app_map_id=3

3. **Validate subscription status**
   - Start: 01/06/2026 10:00:00
   - Expiry: 01/07/2026 10:00:00
   - Current: 21/06/2026 14:30:00
   - **Status: ACTIVE** ✓

4. **Fetch application details**
   - From institution_app_map_id=3:
     - institution_id: 2
     - application_id: 102 (Career Counselling)
     - theme_color_hex: "#9c27b0"
     - customized_app_description: `{"app_title":"Amazonite Counselling","app_subtitle":"Assessments for students"}`
     - spreadsheet_link: `https://docs.google.com/spreadsheets/d/1PEEraFJLV1Iw984n2VlZIgztF8iDrYODN9Ndads/`

5. **Fetch institution details**
   - From institution_id=2:
     - name: "Amazonite Institute"
     - logo_link: "🎓"
     - address: "123 Education Ave"

6. **Build payload for Frontend Generator**
   ```json
   {
     "guid": "924F0004-4BC4-D78F-0000-000000000000",
     "app_id": 1,
     "spreadsheet_url": "https://docs.google.com/spreadsheets/d/1PEEraFJLV1Iw984n2VlZIgztF8iDrYODN9Ndads/",
     "organization_data": {
       "institution_name": "Amazonite Institute",
       "institution_app_title": "Amazonite Counselling",
       "institution_app_subtitle": "Assessments for students",
       "institution_address": "123 Education Ave",
       "institution_logo_link": "🎓",
       "institution_theme_color_hex": "#9c27b0"
     }
   }
   ```

7. **Frontend Generator processes**
   - Checks cache (not cached yet)
   - Loads templates
   - Injects all values
   - Generates complete HTML with embedded CSS and JavaScript
   - Caches result for 10 minutes

8. **User receives**
   - Complete, self-contained HTML application
   - Branded with "Amazonite Counselling" title
   - Theme color #9c27b0
   - Logo emoji 🎓
   - Ready to use immediately (no dependencies)

## 📊 Data Model Relationships

```
                    ┌──────────────────────┐
                    │  subscription        │
                    │────────────────────  │
                    │ subscription_id      │
                    │ iam_guid ◄───────────┼───────┐
                    │ institution_app_     │       │
                    │   map_id             │       │
                    │ start_date_time      │       │
                    │ expiry_date_time     │       │
                    └──────┬───────────────┘       │
                           │                       │
                           │ institution_app_     │
                           │ map_id               │
                           │                       │
                    ┌──────▼──────────────────────┐│
                    │ institution_app_map         ││
                    │────────────────────────────── │
                    │ institution_app_map_id       │
                    │ institution_id ◄──┐          │
                    │ application_id     │         │
                    │ iam_guid ◄─────────┼─────────┘
                    │ password           │
                    │ theme_color_hex    │
                    │ customized_app_    │
                    │   description      │
                    │ spreadsheet_link   │
                    │ max_usage_count    │
                    └──────┬──────┬──────┘
                           │      │
           ┌───────────────┘      │
           │                      │
     institution_id        application_id
           │                      │
           ▼                      ▼
    ┌──────────────┐      ┌──────────────┐
    │ institution  │      │ application  │
    │────────────  │      │────────────  │
    │ inst_id      │      │ app_id       │
    │ name         │      │ name         │
    │ address      │      │ type         │
    │ logo_link    │      │ version      │
    └──────────────┘      └──────────────┘
```

## 🔄 Application Types

| App ID | Application ID | Name | Purpose |
|--------|----------------|------|---------|
| 1 | 102 | Career Counselling App | Psychometric assessments for students |
| 2 | 104 | Contact App | Staff directory and contact management |

## ⚙️ Setup & Deployment

### Prerequisites
- Node.js v18+ (for Frontend Generator)
- Google Account (for Nerve Kernel)
- Render or Vercel account (for hosting Frontend Generator)

### Option 1: Complete Setup (Both Components)

#### A. Deploy Nerve Kernel (Google Apps Script)

1. Create a new Google Apps Script project
   ```
   https://script.google.com/home
   ```

2. Copy the code from `Nerve kernel/nerve-kernel-backend.gs` into editor

3. Update CONFIG constants
   ```javascript
   const CONFIG = {
     SPREADSHEET_ID: '1JbQBMdfV4uIDrqbMJTWo4CRRZtyj7gsgBt8MlSA7UoE',  // Your spreadsheet ID
     APP_GENERATOR_URL: 'https://your-frontend-generator-url.com/api/generate-app'
   };
   ```

4. Deploy as web app
   - Click "Deploy" → "New deployment"
   - Type: "Web app"
   - Execute as: Your account
   - Who has access: "Anyone"
   - Copy the deployment URL

5. Test
   ```bash
   curl "https://script.google.com/macros/d/{scriptId}/usercontent?iam_guid=924F0004-4BC4-D78F-0000-000000000000"
   ```

#### B. Deploy Frontend Generator

1. **Local Setup**
   ```bash
   cd "c:\Users\Visitron\Desktop\Server license management"
   npm install
   npm start
   ```

2. **Deploy to Render**
   - Push code to GitHub
   - Connect Render to your repo
   - Create new Web Service
   - Set build command: `npm install`
   - Set start command: `npm start`
   - Render auto-deploys on push

   Or manually deploy:
   ```bash
   npm install -g render-cli
   render deploy
   ```

3. **Deploy to Vercel** (Alternative)
   ```bash
   npm install -g vercel
   vercel
   ```

### Option 2: Test Frontend Generator Locally

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Test request
curl -X POST http://localhost:3001/api/generate-app \
  -H "Content-Type: application/json" \
  -d '{
    "guid": "924F0004-4BC4-D78F-0000-000000000000",
    "app_id": 1,
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/1PEEraFJLV1Iw984n2VlZIgztF8iDrYODN9Ndads/",
    "organization_data": {
      "institution_name": "Amazonite Institute",
      "institution_app_title": "Amazonite Counselling",
      "institution_app_subtitle": "Assessments for students",
      "institution_address": "123 Education Ave",
      "institution_logo_link": "🎓",
      "institution_theme_color_hex": "#9c27b0"
    }
  }' > test-app.html

# Open in browser
open test-app.html  # or xdg-open on Linux, start on Windows
```

## 🔐 Subscription Status Codes

| Status | Meaning | Response |
|--------|---------|----------|
| **active** | Subscription is currently valid | HTML application generated and returned |
| **expired** | Subscription end date has passed | Expiration notice HTML returned |
| **not_started** | Current date is before start date | JSON status returned (app not yet available) |
| **invalid** | Date format error or start ≥ expiry | Error JSON returned |
| **error** | Unexpected error during processing | Error JSON with details |

## 🐛 Troubleshooting

### Issue: GUID Not Found
**Symptoms**: 404 error "GUID not found"
**Cause**: GUID doesn't exist in subscription sheet
**Solution**: 
1. Verify GUID is correct (case-sensitive)
2. Check subscription sheet has the record
3. Ensure iam_guid column exists in subscription sheet

### Issue: Subscription Expired
**Symptoms**: User sees "Subscription Expired" message
**Cause**: Subscription expiry date has passed
**Solution**:
1. Check current date vs. expiry_date_time in subscription sheet
2. Renew subscription by updating expiry_date_time
3. Format must be: `dd/mm/yyyy hh:mm:ss` (e.g., `21/07/2026 10:00:00`)

### Issue: Missing Spreadsheet Link
**Symptoms**: App generation fails with "Spreadsheet link is required"
**Cause**: institution_app_map record has empty spreadsheet_link
**Solution**:
1. Open institution_app_map sheet
2. Find record by institution_app_map_id
3. Fill in spreadsheet_link column with valid Google Sheets URL

### Issue: Invalid Application ID
**Symptoms**: App generation fails with "Invalid application_id"
**Cause**: application_id is not 102 or 104
**Solution**:
1. Check institution_app_map for application_id
2. Only 102 (Career Counselling) and 104 (Contact App) supported
3. Update to correct application_id

### Issue: Frontend Generator Returns Error
**Symptoms**: App generation fails with response code error
**Cause**: Frontend Generator server is down or request is malformed
**Solution**:
1. Verify Frontend Generator URL in Nerve Kernel CONFIG
2. Check Frontend Generator logs (if deployed on Render)
3. Verify app_id mapping (102→1, 104→2)
4. Test with curl locally

### Issue: Date Format Error
**Symptoms**: Subscription status returns "invalid"
**Cause**: Incorrect date format in subscription sheet
**Solution**:
1. Use format: `dd/mm/yyyy hh:mm:ss`
   - Correct: `21/06/2026 10:30:00`
   - Incorrect: `06/21/2026 10:30:00` (MM/DD/YYYY)
   - Incorrect: `2026-06-21 10:30:00` (ISO format)

## 📝 Logging & Monitoring

### Nerve Kernel (Google Apps Script)
Access logs in Google Apps Script editor:
```
Apps Script → Execution log → Recent runs
```

Each request logs:
```
[getSubscriptionByGUID] Searching for GUID: 924F0004...
[getSubscriptionByGUID] MATCH FOUND at index 0
[validateSubscriptionStatus] Status: active
[triggerAppGeneration] Started for institution_app_map_id: 3
[triggerAppGeneration] Payload: {...}
[triggerAppGeneration] Response code: 200
```

### Frontend Generator (Node.js Server)
Server logs requests to stdout:
```
[2026-06-21T14:30:15.234Z] POST /api/generate-app
  → Organization GUID: 924F0004-4BC4-D78F-0000-000000000000
  → Cache SET for 924F0004...-complete-app.html (TTL: 600s)
  ✓ Generated successfully
```

View cache stats:
```bash
curl http://your-server/cache/stats
```

## 📚 File Structure

```
Server license management/
│
├── README.md                           ← System documentation (this file)
├── README_SERVER.md                    ← Frontend Generator server details
├── package.json                        ← Dependencies
├── server.js                           ← Express server with /api/generate-app endpoint
├── test-server.js                      ← Automated test suite
│
├── Nerve kernel/
│   ├── nerve-kernel-backend.gs         ← Google Apps Script for license validation
│   └── schema/
│       ├── Nerve Kernel - subscription.csv
│       ├── Nerve Kernel - institution.csv
│       ├── Nerve Kernel - institution_application_map.csv
│       └── Nerve Kernel - application.csv
│
├── application/
│   ├── career counselling app/
│   │   ├── index.html
│   │   ├── script.js
│   │   └── styles.css
│   └── career counselling app - template/
│       ├── index.html.template
│       ├── script.js.template
│       └── styles.css.template
│
└── node_modules/                       ← Dependencies (auto-generated)
```

## 🔗 Integration Points

### Nerve Kernel → Frontend Generator
- **Trigger**: When subscription status is "active"
- **Method**: POST request via `UrlFetchApp.fetch()`
- **Payload**: Complete institution and application details
- **Response Handling**: 
  - 200/201 → Extract HTML and return to user
  - Other → Return error JSON

### Frontend Generator → Render/Vercel
- **Deployment**: Push code to GitHub, auto-deploy
- **Environment**: Set `PORT=3001` or use default
- **Entry Point**: `npm start` executes `node server.js`

## 💡 Best Practices

1. **GUID Management**
   - Keep GUIDs unique per subscription
   - Use standard UUID format for consistency
   - Don't expose GUID in logs if sensitive

2. **Date Formats**
   - Always use `dd/mm/yyyy hh:mm:ss` format
   - Ensure subscription_start_date_time < subscription_expiry_date_time
   - Store with timezone awareness if globally distributed

3. **Caching**
   - Frontend Generator caches HTML (10 min TTL)
   - Clear cache if organization data changes
   - Monitor cache stats to prevent memory issues

4. **Error Handling**
   - Nerve Kernel logs all errors to Google Apps Script
   - Frontend Generator returns detailed validation errors
   - Both provide meaningful HTTP status codes

5. **Security**
   - Deploy Nerve Kernel as "Anyone" access (already validated by GUID)
   - Validate all incoming data on Frontend Generator
   - Use environment variables for sensitive URLs

## 📞 Support

For issues with:
- **License validation**: Check Nerve Kernel logs in Google Apps Script
- **App generation**: Check Frontend Generator logs on Render/Vercel
- **Data integrity**: Verify Google Sheets data matches schema
- **Deployment**: Check deployment platform logs (Render/Vercel/GitHub)

---

**System Version**: 1.0.0  
**Last Updated**: June 21, 2026  
**Author**: License Management Team
