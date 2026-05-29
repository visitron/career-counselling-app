# Feature Comparison: index_v1.html vs index_v2.html

## Missing Feature in index_v2.html

The **Details Button** feature that displays complete contact details in a modal popup is functionally present but has **broken data references** that prevent it from working correctly.

---

## What Works in index_v1.html ✅

### 1. **Details Modal**
- Click "Details" button on any contact card
- Shows a comprehensive modal with:
  - Profile avatar with initials
  - Name, designation, department
  - Description/bio (if available)
  - LinkedIn profile link (if available)
  - Personal website link (if available)
  - Contact Information:
    - Mobile number with copy button
    - WhatsApp link with action button
    - Email with copy button
  - Action buttons: Call, WhatsApp, Email
  - "Flip Card" button to see digital business card
  - Edit profile button (for own profile)

### 2. **Digital Business Card (Flip Card)**
- Accessible via "Flip Card" button in the details modal
- Shows as a 3D flippable card with:
  - **Front side**: Name and designation
  - **Back side**: Contact details
    - Avatar with initials
    - Full name and designation
    - Department
    - Mobile number
    - Email address
  - Auto-flips after 900ms
  - Tap to manually flip
  - Action buttons: Call, WhatsApp, Email, Save Contact (vCard), Map, Share

---

## What's Broken in index_v2.html ❌

### Issue 1: Wrong Data Array Reference
**Location**: `openFlipCard()` function (line ~2021)

```javascript
// v1 (WORKS):
for(var i=0;i<STAFF_DATA.length;i++){ if(STAFF_DATA[i].id===id){ s=STAFF_DATA[i]; break; } }

// v2 (BROKEN):
for(var i=0;i<allStaff.length;i++){ if(allStaff[i].id===id){ s=allStaff[i]; break; } }
```

**Problem**: v2 tries to use `allStaff` array which doesn't exist or isn't populated. The actual staff data is still defined as `STAFF_DATA`.

---

### Issue 2: Data Handling for Mobile/WhatsApp
**Location**: `openFlipCard()` function

```javascript
// v1 (WORKS):
var mob=s.mobile?s.mobile.replace(/\D/g,'').slice(-10):'';
var wa=s.whatsapp?s.whatsapp.replace(/\D/g,'').slice(-10):'';

// v2 (POTENTIALLY BREAKS):
var mob=(s.mobile || "").toString().replace(/\D/g,'').slice(-10);
var wa=(s.whatsapp || "").toString().replace(/\D/g,'').slice(-10);
```

While v2's approach is safer (handles undefined), if the data doesn't load, it won't help.

---

### Issue 3: Google Sheets Integration
**Location**: `openEditModal()` → Save changes handler

```javascript
// v1:
postToGoogleSheets({action:'edit_profile',mobile:currentUser,staffId:s.id, ...})

// v2:
apiCall('updateStaff', { staff: { id: s.id, ... }, adminPassword: 'staff_profile_edit' })
```

v2 expects an API endpoint that may not be configured.

---

## How to Fix index_v2.html

### Quick Fix - Change Array Reference:

```javascript
// In openFlipCard() function, change:
for(var i=0;i<allStaff.length;i++){ if(allStaff[i].id===id){ s=allStaff[i]; break; } }

// TO:
for(var i=0;i<STAFF_DATA.length;i++){ if(STAFF_DATA[i].id===id){ s=STAFF_DATA[i]; break; } }
```

### Complete Solution:

1. **Replace `allStaff` with `STAFF_DATA`** in the `openFlipCard()` function
2. **Update the edit save handler** to use `postToGoogleSheets()` instead of `apiCall()`
3. **Verify all flipcard-related functions** reference the correct data array

---

## Files Affected
- `index_v2.html` - openFlipCard() function (around line 2021)
- `index_v2.html` - openEditModal() save handler (around line 2254)

---

## Features Present in Both Versions

✅ Contact card grid display  
✅ Search functionality  
✅ Filter by department  
✅ Grid/List view toggle  
✅ Quick actions (Call, WhatsApp, Email) on card  
✅ Settings (Theme, accessibility)  
✅ About page  

---

## Summary

The Details Button and Digital Card features **are implemented in both versions**, but index_v2.html has **broken data references** that prevent them from functioning. The HTML structure and CSS are identical, but the JavaScript uses the wrong variable names for accessing the staff data.
