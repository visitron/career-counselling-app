# SIT Staff Directory - API Decoupling Guide

## Overview

The application has been refactored to decouple the frontend (HTML) from the backend (Google Apps Script). The frontend now communicates with the backend through HTTP API calls, allowing independent deployment and offline resilience through cached data.

## Architecture

```
┌─────────────────────────┐
│  Frontend (index.html)  │
│  - Deployed locally or  │
│  - Hosted externally    │
└────────────┬────────────┘
             │
          fetch()
             │
    ┌────────▼────────┐
    │    API_URL      │
    │  (Google Apps   │
    │   Script Web    │
    │     App)        │
    └────────┬────────┘
             │
    ┌────────▼──────────────┐
    │  code.gs Backend API  │
    │  - handleLogin()      │
    │  - handleGetStaff()   │
    │  - CRUD operations    │
    │  - Biometric handlers │
    └────────┬──────────────┘
             │
    ┌────────▼──────────────┐
    │  Google Sheets        │
    │  - Staff sheet        │
    │  - BiometricLog sheet │
    └───────────────────────┘
```

## Configuration Steps

### Step 1: Deploy Backend as Web App

1. **Open Google Apps Script Project**
   - Navigate to your Apps Script project containing `code.gs`
   - URL: `https://script.google.com/home`

2. **Deploy as Web App**
   - Click **Deploy** → **New Deployment**
   - Select type: **Web App**
   - Execute as: Your account (or service account)
   - Who has access: **Anyone** (or **Anyone with the link** for security)
   - Click **Deploy**

3. **Copy the Web App URL**
   - After deployment, copy the deployment URL
   - Format: `https://script.google.com/macros/d/{SCRIPT_ID}/userweb`

### Step 2: Configure Frontend API URL

1. **Open `index.html`** in your code editor

2. **Find the API configuration section** (around line 1475-1480):
   ```javascript
   // IMPORTANT: Update this URL with your deployed Google Apps Script Web App URL
   // Format: https://script.google.com/macros/d/{SCRIPT_ID}/userweb
   var API_URL = 'https://script.google.com/macros/d/YOUR_SCRIPT_ID_HERE/userweb';
   ```

3. **Replace `YOUR_SCRIPT_ID_HERE`** with your actual Script ID
   - Get Script ID from: **Project Settings** in Apps Script

4. **Save the file**

### Step 3: Handle CORS (if hosting externally)

If you're hosting the frontend on an external server (GitHub Pages, Vercel, etc.) and experience CORS errors:

**Option A: Add CORS Headers to Backend** (Recommended)

Update `code.gs` to add CORS headers to all responses:

```javascript
function doPost(e) {
  var result = { /* existing logic */ };
  return jsonOut(result)
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    .addHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function doOptions(e) {
  return HtmlService.createHtmlOutput('')
    .addHeader('Access-Control-Allow-Origin', '*')
    .addHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    .addHeader('Access-Control-Allow-Headers', 'Content-Type');
}
```

**Option B: Deploy Frontend on Same Domain** (Most Secure)

Deploy both frontend and backend on the same Google Apps Script deployment.

**Option C: Use a Proxy Server**

Route frontend requests through a same-origin proxy server.

## Feature Overview

### 1. **Dynamic Data Fetching**
- Replaces hardcoded `STAFF_DATA` array
- Data is fetched from backend API via `fetchStaffFromAPI()`
- Triggered on app load or when user logs in

### 2. **Offline Resilience**
- Data cached in browser's `localStorage`
- Cache TTL: 1 hour (configurable via `API_CACHE_TTL`)
- Automatic fallback to cache if API unavailable
- Displays "offline" banner when cached data is used

### 3. **Login & Authentication**
- Frontend sends mobile number to `handleLogin()` API
- Backend verifies against Google Sheets staff records
- Session stored as JSON in localStorage (includes role & user data)
- Auto-restore session on page reload

### 4. **Search & Filtering**
- Works with dynamically loaded staff data
- Filters by department, designation, name, email, mobile

### 5. **Profile Editing**
- Staff can edit: description, LinkedIn, website
- Edits saved locally in localStorage
- Updated via `updateStaff()` API

### 6. **Biometric Registration** (if supported)
- `registerBiometric()` now calls API endpoint
- Biometric data stored in Google Sheets BiometricLog sheet

### 7. **Data Caching Strategy**
- Cache operations:
  - `cacheStaffData(data)` → Save to localStorage
  - `getCachedStaffData()` → Retrieve from cache
  - `isCacheValid()` → Check cache age
- Cache keys: `sit_staff_cache`, `sit_staff_cache_ts`

## Deployment Options

### **Option 1: Local Development**
```bash
# Serve index.html locally on port 8000
python -m http.server 8000

# Then navigate to http://localhost:8000
```

### **Option 2: GitHub Pages**
1. Push `index.html` to GitHub repository
2. Enable GitHub Pages in repository settings
3. Access via: `https://username.github.io/repo/index.html`
4. Ensure `API_URL` points to your deployed backend

### **Option 3: Vercel**
1. Push files to GitHub
2. Connect repo to Vercel
3. Deploy automatically
4. Ensure `API_URL` points to your deployed backend

### **Option 4: Static Hosting (Firebase, Netlify, etc.)**
1. Upload `index.html` to hosting service
2. Configure `API_URL` for your backend endpoint
3. Deploy

## Testing Checklist

- [ ] Backend deployed as Web App
- [ ] Frontend API_URL configured correctly
- [ ] Login works (uses API not hardcoded data)
- [ ] Staff directory loads from API
- [ ] Search and filtering work
- [ ] Profile edit saves changes
- [ ] Biometric registration works (if supported)
- [ ] Offline mode works (disable network, verify cache fallback)
- [ ] Session restore works (refresh page after login)
- [ ] CORS works (if frontend hosted externally)

## API Endpoints

All endpoints POST to the backend with action parameter:

```javascript
apiCall(action, params)
```

### Implemented Endpoints:

| Action | Params | Response |
|--------|--------|----------|
| `login` | `{mobile, password}` | `{success, role, user}` |
| `getStaff` | `{}` | `{success, staff: []}` |
| `updateStaff` | `{staff, adminPassword}` | `{success, message}` |
| `addStaff` | `{staff, adminPassword}` | `{success, message}` |
| `deleteStaff` | `{id, adminPassword}` | `{success, message}` |
| `register_biometric` | `{staff_id, name, email, biometric_string}` | `{success, message}` |
| `verify_biometric` | `{staff_id, biometric_string}` | `{success, matched}` |

## Troubleshooting

### **"Network error" on login/load**
- ✅ Verify backend is deployed as Web App
- ✅ Check `API_URL` matches your deployment URL
- ✅ Test API directly: open `API_URL` in browser (should show admin panel)
- ✅ Check browser console for CORS errors

### **CORS errors when externally hosted**
- ✅ Add CORS headers to `code.gs` (see Option A above)
- ✅ Or host frontend on same domain as backend

### **Stale data displayed**
- ✅ Verify `fetchStaffFromAPI()` is called after login
- ✅ Clear browser cache: Storage → Clear Site Data

### **Cache not working offline**
- ✅ Check localStorage quota (usually 5-10MB)
- ✅ Verify cache keys: `sit_staff_cache`, `sit_staff_cache_ts`
- ✅ First load must succeed to populate cache

### **Session not restoring**
- ✅ Check that session data is valid JSON
- ✅ Session format: `{mobile, role, user: {...}}`

## Security Considerations

1. **Admin Password**: Currently hardcoded. For production, use:
   - OAuth authentication
   - API keys
   - JWT tokens

2. **Data in localStorage**: Not encrypted. Sensitive data should not be cached locally.

3. **API Exposure**: Backend is public. Implement authentication:
   - IP whitelisting
   - Rate limiting
   - Request signing

4. **HTTPS**: Always use HTTPS in production (not HTTP).

## Migration Notes

### What Changed?

| Aspect | Before | After |
|--------|--------|-------|
| Data Source | Hardcoded STAFF_DATA | API (dynamic) |
| Communication | google.script.run | fetch() HTTP |
| Login | Local validation | API validation |
| Cache | None | localStorage (1 hour TTL) |
| Offline | Not supported | Cached data fallback |
| Deployment | Google Apps Script environment | Independent |

### Backward Compatibility?

- ❌ Old `google.script.run` calls removed
- ❌ Hardcoded STAFF_DATA replaced with dynamic `allStaff`
- ✅ UI/UX unchanged
- ✅ All features preserved

## Next Steps

1. ✅ Deploy `code.gs` as Web App
2. ✅ Update API_URL in `index.html`
3. ✅ Test login locally
4. ✅ Test staff directory loading
5. ✅ Verify cache/offline functionality
6. ✅ Deploy frontend to external hosting (optional)
7. ✅ Configure CORS if needed
8. ✅ Document API URL for users/administrators

## Support

For issues or questions:
- Check browser console for detailed error messages
- Verify network tab in DevTools for API requests
- Review Google Apps Script execution logs
- Test API endpoint directly in browser
