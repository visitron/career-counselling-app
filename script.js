// ── STATE ──────────────────────────────────────────────────────
// IMPORTANT: Update this URL with your GAS deployment URL
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbweDi1Y7ObdnBjlxuHPP6lCYkjSNMfjtVF2wHzGaLbyvpqyev85mqUzDqM_fbrn-xXp/exec'; // Replace YOUR_DEPLOYMENT_ID
// p:participant
var P = null, testId = null;
// Exam state: questions, current index, answers, skipped
var Qs = [], idx = 0, ans = {}, skp = {};
// Timer state 
var timerSec = 0, timerInt = null, startMs = null, testInfo = null;
var submitted = false;
// Prefetch cache for test data to speed up exam start on dashboard
var pfCache = {};
// Admin state
var allParticipants = [], selectedParticipants = [], allTests = [], selectedTestIds = [], searchOriginal = [];
// Option marks helper (if needed for dynamic marking schemes)
function optionMarks(i) { return Math.max(5 - i, 1); }

// ── ROUTING ────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function tab(t) {
  ['signin', 'register'].forEach(function (x) {
    var X = x.charAt(0).toUpperCase() + x.slice(1);
    document.getElementById('tab' + X).classList.toggle('active', x === t);
    document.getElementById('panel' + X).classList.toggle('active', x === t);
  });
  ['lMsg', 'rMsg', 'fMsg'].forEach(function (id) { var e = el(id); if (e) e.style.display = 'none'; });
  var fi = el('forgotInline'); if (fi) fi.classList.remove('open');
}

// ── UTILS ──────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function v(id) { return el(id).value.trim(); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escQ(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function togglePwd(id) { var f = el(id); f.type = f.type === 'password' ? 'text' : 'password'; }
function busy(b, s, t, on) { el(b).disabled = on; el(s).style.display = on ? 'inline-block' : 'none'; if (t) el(t).style.display = on ? 'none' : 'inline'; }
function msg(id, m, type) { var e = el(id); e.innerHTML = m; e.className = 'msg ' + type; e.style.display = 'block'; }

// ── API HELPER ──────────────────────────────────────────────────────
/**
 * Call GAS API endpoint
 * @param {string} action - API action name
 * @param {object} params - Parameters to send
 * @param {function} onSuccess - Success callback
 * @param {function} onError - Error callback
 */
function callAPI(action, params, onSuccess, onError) {
  const payload = { action: action, ...params };
  fetch(GAS_API_URL, {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(data => {
      if (onSuccess) onSuccess(data);
    })
    .catch(err => {
      console.error('API Error:', err);
      if (onError) onError(err);
    });
}

function toggleForgot() {
  var fi = el('forgotInline');
  fi.classList.toggle('open');
  if (fi.classList.contains('open')) { el('fEmail').focus(); el('fMsg').style.display = 'none'; }
}

// ── TIMER ──────────────────────────────────────────────────────
function stopTimer() {
  if (timerInt) { clearInterval(timerInt); timerInt = null; }
}

// ── AUTH ────────────────────────────────────────────────────────
function doLogin() {
  var u = v('lUser'), pw = el('lPwd').value;
  var isAdmin = el('adminToggle').checked;
  var role = isAdmin ? 'admin' : 'participant';
  el('lMsg').style.display = 'none';
  if (!u || !pw) { msg('lMsg', 'Please enter your email/mobile and password.', 'err'); return; }
  busy('lBtn', 'lSpin', 'lBtnTxt', true);
  callAPI('loginUser', {
    emailOrMobile: u,
    password: pw,
    organizationId: 'A7X2',
    role: role
  }, function (r) {
    busy('lBtn', 'lSpin', 'lBtnTxt', false);
    if (r.success) {
      P = r.participant;
      P.role = role;
      if (P.role === 'admin') { loadAdminDashboard(); }
      else { loadDashboard(); }
    }
    else if (r.notFound) { msg('lMsg', '⚠ ' + r.message + ' <button class="tlink" onclick="tab(\'register\')" style="margin-left:4px;">Register →</button>', 'warn'); }
    else { msg('lMsg', r.message, 'err'); }
  }, function (e) {
    busy('lBtn', 'lSpin', 'lBtnTxt', false);
    msg('lMsg', 'Error: ' + e.message, 'err');
  });
}

// ── ADMIN DASHBOARD ────────────────────────────────────────────
function loadAdminDashboard() {
  if (!P || P.role !== 'admin') { showPage('pgAuth'); return; }
  stopTimer();
  el('aDTopName').textContent = P.name || '';
  el('aPCount').textContent = 'Loading...';
  el('participantTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--sub);"><div class="ldr"></div><p style="margin-top:10px;">Loading participants...</p></td></tr>';
  selectedParticipants = [];
  el('selectAllCheckbox').checked = false;
  el('aSelectAllBtn').textContent = 'Select All';
  el('aAssignBtn').disabled = true;
  el('aAssignBtn').style.opacity = '0.55';
  el('aAssignBtn').style.cursor = 'not-allowed';
  // Remove support button exam mode
  const supportBtn = el('supportBtn');
  if (supportBtn) supportBtn.classList.remove('exam-mode');
  showPage('pgAdminDashboard');
  callAPI('getParticipants', { organizationId: 'A7X2' }, function (r) {
    if (r.success) {
      allParticipants = r.participants || [];
      searchOriginal = JSON.parse(JSON.stringify(allParticipants));
      renderParticipantsTable(allParticipants);
      el('aPCount').textContent = allParticipants.length + ' participant' + (allParticipants.length !== 1 ? 's' : '');
    } else {
      el('participantTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--err);padding:30px;">Failed to load participants: ' + esc(r.message) + '</td></tr>';
    }
  }, function (e) {
    el('participantTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--err);padding:30px;">Error: ' + esc(e.message) + '</td></tr>';
  });
}

function renderParticipantsTable(participants) {
  var h = '';
  if (!participants.length) {
    el('participantTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--sub);padding:30px;">No participants found.</td></tr>';
    return;
  }
  participants.forEach(function (p) {
    var checked = selectedParticipants.indexOf(p.participant_id) >= 0 ? 'checked' : '';
    h += '<tr' + (checked ? ' class="selected"' : '') + '>';
    h += '<td><input type="checkbox" value="' + p.participant_id + '" onchange="toggleParticipantSelection(this)" ' + checked + '></td>';
    h += '<td>' + esc(p.name || '—') + '</td>';
    h += '<td>' + esc(p.email || '—') + '</td>';
    h += '<td>' + esc(p.mobile_number || '—') + '</td>';
    h += '<td>' + esc(p.institution || '—') + '</td>';
    h += '<td style="text-align:center;">' + esc(String(p.number_of_logins || 0)) + '</td>';
    h += '</tr>';
  });
  el('participantTableBody').innerHTML = h;
}

function toggleParticipantSelection(checkbox) {
  var pId = parseInt(checkbox.value);
  var isChecked = checkbox.checked;
  var idx = selectedParticipants.indexOf(pId);
  if (isChecked && idx < 0) { selectedParticipants.push(pId); }
  else if (!isChecked && idx >= 0) { selectedParticipants.splice(idx, 1); }
  updateSelectAllCheckbox();
  updateAssignButtonState();
  // Toggle row selection styling
  var row = checkbox.closest('tr');
  if (isChecked) { row.classList.add('selected'); }
  else { row.classList.remove('selected'); }
}

function toggleSelectAll() {
  var checkbox = el('selectAllCheckbox');
  var isChecked = checkbox.checked;
  selectedParticipants = [];
  if (isChecked) {
    allParticipants.forEach(function (p) { selectedParticipants.push(p.participant_id); });
  }
  document.querySelectorAll('#participantTableBody input[type="checkbox"]').forEach(function (cb) {
    cb.checked = isChecked;
    var row = cb.closest('tr');
    if (isChecked) { row.classList.add('selected'); }
    else { row.classList.remove('selected'); }
  });
  updateSelectAllCheckbox();
  updateAssignButtonState();
}

function updateSelectAllCheckbox() {
  var checkbox = el('selectAllCheckbox');
  var btn = el('aSelectAllBtn');
  var allChecked = selectedParticipants.length === allParticipants.length && allParticipants.length > 0;
  checkbox.checked = allChecked;
  btn.textContent = allChecked ? 'Deselect All' : 'Select All';
}

function updateAssignButtonState() {
  var btn = el('aAssignBtn');
  var hasSelection = selectedParticipants.length > 0;
  btn.disabled = !hasSelection;
  btn.style.opacity = hasSelection ? '1' : '0.55';
  btn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
}

function filterParticipants() {
  var query = v('aSearch').toLowerCase();
  if (!query) {
    allParticipants = JSON.parse(JSON.stringify(searchOriginal));
  } else {
    allParticipants = searchOriginal.filter(function (p) {
      return (p.name || '').toLowerCase().indexOf(query) >= 0 ||
             (p.email || '').toLowerCase().indexOf(query) >= 0 ||
             (p.mobile_number || '').indexOf(query) >= 0;
    });
  }
  selectedParticipants = [];
  el('selectAllCheckbox').checked = false;
  updateAssignButtonState();
  renderParticipantsTable(allParticipants);
}

function openTestAssignmentModal() {
  console.log('openTestAssignmentModal called. selectedParticipants:', selectedParticipants);
  if (selectedParticipants.length === 0) { 
    console.log('No participants selected, returning');
    return; 
  }
  console.log('Opening test modal with', selectedParticipants.length, 'participants');
  el('testModalOverlay').classList.add('on');
  el('selectedCountLabel').textContent = String(selectedParticipants.length);
  el('testList').innerHTML = '<div class="ldr"></div>';
  el('assignConfirmBtn').disabled = true;
  el('assignConfirmBtn').style.opacity = '0.55';
  selectedTestIds = [];
  var orgId = P && P.organization_id ? P.organization_id : 'A7X2';
  console.log('Calling getTests with organizationId:', orgId);
  callAPI('getTests', { organizationId: orgId }, function (r) {
    console.log('getTests response:', r);
    if (r.success) {
      allTests = r.tests || [];
      console.log('Loaded', allTests.length, 'tests');
      renderTestSelectionList(allTests);
    } else {
      console.log('getTests failed:', r.message);
      el('testList').innerHTML = '<p style="color:var(--err);text-align:center;padding:20px;">Failed to load tests: ' + esc(r.message) + '</p>';
    }
  }, function (e) {
    console.log('getTests error:', e.message);
    el('testList').innerHTML = '<p style="color:var(--err);text-align:center;padding:20px;">Error: ' + esc(e.message) + '</p>';
  });
}

function renderTestSelectionList(tests) {
  if (!tests.length) {
    el('testList').innerHTML = '<p style="text-align:center;color:var(--sub);padding:20px;">No tests available.</p>';
    return;
  }
  var h = '';
  tests.forEach(function (t) {
    var testId = parseInt(t.test_id, 10);
    h += '<div class="test-item" id="test_' + testId + '" style="cursor:pointer;">';
    h += '<div style="display:flex;align-items:center;gap:8px;">';
    h += '<input type="checkbox" name="testSelection" value="' + testId + '" onchange="toggleTest(' + testId + ')" style="cursor:pointer;">';
    h += '<span class="test-item-name" style="cursor:pointer;flex:1;">' + esc(t.name) + '</span>';
    h += '</div>';
    h += '<div class="test-item-desc">' + esc(t.description || 'No description') + '</div>';
    h += '<div class="test-item-meta"><span>⏱ ' + esc(String(t.duration_in_minutes)) + ' min</span><span>📝 ' + esc(String(t.total_marks)) + ' marks</span></div>';
    h += '</div>';
  });
  el('testList').innerHTML = h;
}

function toggleTest(testId) {
  testId = parseInt(testId, 10);  // Ensure testId is a number
  console.log('toggleTest called with testId:', testId, 'selectedTestIds before:', selectedTestIds);
  
  var idx = selectedTestIds.indexOf(testId);
  var testElement = el('test_' + testId);
  if (!testElement) {
    console.error('Test element not found for testId:', testId);
    return;
  }
  
  var checkbox = testElement.querySelector('input[name="testSelection"]');
  
  if (idx >= 0) {
    selectedTestIds.splice(idx, 1);
    if (checkbox) checkbox.checked = false;
    testElement.classList.remove('selected');
  } else {
    selectedTestIds.push(testId);
    if (checkbox) checkbox.checked = true;
    testElement.classList.add('selected');
  }
  
  console.log('selectedTestIds after:', selectedTestIds);
  updateTestAssignButtonState();
}

function updateTestAssignButtonState() {
  var hasSelection = selectedTestIds.length > 0;
  el('assignConfirmBtn').disabled = !hasSelection;
  el('assignConfirmBtn').style.opacity = hasSelection ? '1' : '0.55';
  el('assignConfirmBtn').style.cursor = hasSelection ? 'pointer' : 'not-allowed';
}

function confirmTestAssignment() {
  console.log('confirmTestAssignment called. selectedTestIds:', selectedTestIds, 'selectedParticipants:', selectedParticipants);
  if (selectedTestIds.length === 0 || selectedParticipants.length === 0) {
    console.log('Validation failed. Tests selected:', selectedTestIds.length > 0, 'Participants selected:', selectedParticipants.length > 0);
    return;
  }
  el('assignConfirmBtn').disabled = true;
  el('assignConfirmBtn').style.opacity = '0.55';
  var orgId = P && P.organization_id ? P.organization_id : 'A7X2';
  var adminId = (P && P.admin_id) ? P.admin_id : (P && P.participant_id ? P.participant_id : null);
  console.log('Assigning tests. testIds:', selectedTestIds, 'participantIds:', selectedParticipants, 'orgId:', orgId, 'adminId:', adminId);
  callAPI('assignTest', {
    organizationId: orgId,
    testIds: selectedTestIds,
    participantIds: selectedParticipants,
    adminId: adminId
  }, function (r) {
    el('assignConfirmBtn').disabled = false;
    el('assignConfirmBtn').style.opacity = '1';
    console.log('assignTest response:', r);
    if (r.success) {
      msg('testModalMsg', '✓ ' + r.message, 'ok');
      setTimeout(function () { closeTestAssignmentModal(); }, 1500);
    } else {
      msg('testModalMsg', '⚠ ' + r.message, 'err');
    }
  }, function (e) {
    el('assignConfirmBtn').disabled = false;
    el('assignConfirmBtn').style.opacity = '1';
    console.log('assignTest error:', e.message);
    msg('testModalMsg', 'Error: ' + esc(e.message), 'err');
  });
}

function closeTestAssignmentModal() {
  el('testModalOverlay').classList.remove('on');
  el('testModalMsg').style.display = 'none';
  selectedTestIds = [];
  loadAdminDashboard();
}

function doLogout() {
  P = null;
  selectedParticipants = [];
  allParticipants = [];
  allTests = [];
  selectedTestId = null;
  el('adminToggle').checked = false;
  el('lUser').value = '';
  el('lPwd').value = '';
  el('lMsg').style.display = 'none';
  el('rMsg').style.display = 'none';
  showPage('pgAuth');
  tab('signin');
}

function doRegister() {
  el('rMsg').style.display = 'none';
  var orgId = 'A7X2';
  if (!orgId) { msg('rMsg', 'Please select an organization.', 'err'); return; }
  var data = {
    organization_id: orgId,
    name: v('rName'), date_of_birth: v('rDob'), mobile_number: v('rMobile'),
    email: v('rEmail'), institution: v('rInst'), password: el('rPwd').value.trim(),
    father_name: v('rFN'), father_mobile_number: v('rFM'), father_email: v('rFE'),
    mother_name: v('rMN'), mother_mobile_number: v('rMM'), mother_email: v('rME')
  };
  if (!data.name || !data.email || !data.mobile_number || !data.password) {
    msg('rMsg', 'Name, email, mobile and password are required.', 'err'); return;
  }
  busy('rBtn', 'rSpin', 'rBtnTxt', true);
  callAPI('registerParticipant', data, function (r) {
    busy('rBtn', 'rSpin', 'rBtnTxt', false);
    if (r.success) { msg('rMsg', r.message + ' Switching to sign in…', 'ok'); setTimeout(function () { tab('signin'); }, 2000); }
    else if (r.alreadyExists) { msg('rMsg', r.message + ' <button class="tlink" onclick="tab(\'signin\')" style="margin-left:4px;">Sign in →</button>', 'warn'); }
    else { msg('rMsg', r.message, 'err'); }
  }, function (e) {
    busy('rBtn', 'rSpin', 'rBtnTxt', false);
    msg('rMsg', 'Error: ' + e.message, 'err');
  });
}

function doForgot() {
  el('fMsg').style.display = 'none';
  var email = v('fEmail');
  if (!email) { msg('fMsg', 'Please enter your email.', 'err'); return; }
  busy('fBtn', 'fSpin', 'fBtnTxt', true);
  callAPI('forgotPassword', { email: email }, function (r) {
    busy('fBtn', 'fSpin', 'fBtnTxt', false);
    msg('fMsg', r.message, r.success ? 'ok' : 'err');
    if (r.success) setTimeout(function () { el('forgotInline').classList.remove('open'); }, 3000);
  }, function (e) {
    busy('fBtn', 'fSpin', 'fBtnTxt', false);
    msg('fMsg', 'Error: ' + e.message, 'err');
  });
}

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  if (el('panelSignin').classList.contains('active') && !el('forgotInline').classList.contains('open')) doLogin();
  if (el('panelSignin').classList.contains('active') && el('forgotInline').classList.contains('open')) doForgot();
});

// ── DASHBOARD ──────────────────────────────────────────────────
function loadDashboard() {
  if (!P) { showPage('pgAuth'); return; }
  stopTimer();
  submitted = false;
  el('dTopName').textContent = P.name || '';
  el('dName').textContent = P.name || '—';
  el('dEmail').textContent = P.email || '—';
  el('dMobile').textContent = P.mobile_number || '—';
  el('dInst').textContent = P.institution || '—';
  el('dDob').textContent = new Date(P.date_of_birth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-') || '—';
  el('dLogins').textContent = P.number_of_logins || '1';
  el('dFather').textContent = P.father_name || (P.father_email || '—');
  el('dMother').textContent = P.mother_name || (P.mother_email || '—');
  el('dReg').textContent = new Date(P.registration_date).toLocaleString('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
}).replace(',', '').replace(/ /g, (m, i) => i < 11 ? '-' : ' ') || '—';
  el('dTests').innerHTML = '<div class="cbox" style="min-height:140px;"><div class="ldr"></div><p>Loading tests…</p></div>';
  // Remove support button exam mode
  const supportBtn = el('supportBtn');
  if (supportBtn) supportBtn.classList.remove('exam-mode');
  showPage('pgDashboard');
  callAPI('getTests', { organizationId: 'A7X2', participantId: P.participant_id }, function (r) {
    if (r.success) renderTests(r.tests || []);
    else el('dTests').innerHTML = '<p style="color:var(--err);padding:30px;text-align:center;">Failed: ' + esc(r.message) + '</p>';
  }, function (e) {
    el('dTests').innerHTML = '<p style="color:var(--err);padding:30px;text-align:center;">Failed: ' + esc(e.message) + '</p>';
  });
}

function renderTests(tests) {
  // Keep already-ready cache entries so returning from exam is instant
  var fresh = {};
  tests.forEach(function (t) {
    if (pfCache[t.test_id] && pfCache[t.test_id].status === 'ready') fresh[t.test_id] = pfCache[t.test_id];
  });
  pfCache = fresh;

  el('dTCount').textContent = tests.length + ' test' + (tests.length !== 1 ? 's' : '');
  if (!tests.length) {
    el('dTests').innerHTML = '<p style="text-align:center;color:var(--sub);padding:36px;">No tests available.</p>';
    return;
  }
  var h = '<div class="tgrid">';
  tests.forEach(function (t) {
    var ready = pfCache[t.test_id] && pfCache[t.test_id].status === 'ready';
    var isPaid = t.amount_paid === 1;
    h += '<div class="tcard">'
      + '<div class="ttop"><span class="tbadge">Test #' + t.test_id + '</span>'
      + (t.department_name ? '<span class="dtag">' + esc(t.department_name) + '</span>' : '') + '</div>'
      + '<div class="tname">' + esc(t.name) + '</div>'
      + '<div class="tdesc">' + esc(t.description || 'Psychometric assessment') + '</div>'
      + '<div class="tmeta">'
      + '<div class="mb"><div class="ml">⏱ Duration</div><div class="mv">' + esc(String(t.duration_in_minutes)) + ' min</div></div>'
      + '<div class="mb"><div class="ml">📝 Max Marks</div><div class="mv">' + esc(String(t.total_marks)) + '</div></div>'
      + '</div>'
      + '<div class="tfoot">';
    
    if (!isPaid) {
      h += '<div style="background-color:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:12px;margin-bottom:10px;font-size:0.85rem;color:#333;">'
        + '💳 <strong>Payment Pending</strong><br>'
        + 'Please pay the required amount and inform the admin to mark you as paid.'
        + '</div>'
        + '<button class="bstart" disabled style="opacity:0.6;cursor:not-allowed;">Test Locked (Payment Required)</button>';
    } else {
      h += '<span class="pf-badge' + (ready ? ' ready' : '') + '" id="pf_' + t.test_id + '">' + (ready ? '✓ Ready' : '⏳ Preparing…') + '</span>'
        + '<button class="bstart" onclick="startTest(' + t.test_id + ')">Take Test →</button>';
    }
    
    h += '</div></div>';
  });
  el('dTests').innerHTML = h + '</div>';
  tests.forEach(function (t) {
    if (t.amount_paid === 1 && (!pfCache[t.test_id] || pfCache[t.test_id].status === 'error')) prefetch(t.test_id);
  });
}

function prefetch(tid) {
  pfCache[tid] = { status: 'loading', data: null };
  callAPI('getExamData', { testId: tid, organizationId: 'A7X2', participantId: P.participant_id }, function (data) {
    if (data.success) {
      pfCache[tid] = { status: 'ready', data: data };
      var b = el('pf_' + tid);
      if (b) { b.textContent = '✓ Ready'; b.className = 'pf-badge ready'; }
    } else {
      pfCache[tid] = { status: 'error', data: null };
      var b = el('pf_' + tid);
      if (b) b.className = 'pf-badge gone';
    }
  }, function () {
    pfCache[tid] = { status: 'error', data: null };
    var b = el('pf_' + tid);
    if (b) b.className = 'pf-badge gone';
  });
}

function doLogout() {
  stopTimer();
  P = null; testId = null; pfCache = {};
  el('lUser').value = ''; el('lPwd').value = '';
  showPage('pgAuth');
}

// ── EXAM ────────────────────────────────────────────────────────
function startTest(tid) {
  testId = tid; Qs = []; idx = 0; ans = {}; skp = {}; submitted = false;
  stopTimer();
  el('eTestName').textContent = 'Loading…';
  el('eProg').style.width = '0%';
  el('eTimer').textContent = '⏰ --:--';
  el('eTimer').className = 'tpill';
  el('eBody').innerHTML = '<div class="cbox" style="width:100%;"><div class="ldr"></div><p>Loading questions…</p><p class="lstep" id="lstep">Connecting…</p></div>';
  showPage('pgExam');
  // Move support button for exam mode
  const supportBtn = el('supportBtn');
  if (supportBtn) supportBtn.classList.add('exam-mode');

  if (pfCache[tid] && pfCache[tid].status === 'ready') {
    onExamLoaded(pfCache[tid].data);
    return;
  }
  var steps = ['Connecting to server…', 'Reading questions…', 'Almost ready…'], si = 0;
  var stInt = setInterval(function () {
    si = (si + 1) % steps.length; var e = el('lstep'); if (e) e.textContent = steps[si];
  }, 1800);
  callAPI('getExamData', { testId: tid, organizationId: 'A7X2', participantId: P.participant_id }, function (data) {
    clearInterval(stInt);
    if (data.success) {
      pfCache[tid] = { status: 'ready', data: data };
      onExamLoaded(data);
    } else {
      el('eBody').innerHTML =
        '<div class="cbox" style="width:100%;">'
        + '<p style="color:var(--err);margin-bottom:14px;">Load failed: ' + esc(data.message) + '</p>'
        + '<button class="bn bnext" onclick="loadDashboard()">← Back to Dashboard</button>'
        + '</div>';
    }
  }, function (e) {
    clearInterval(stInt);
    el('eBody').innerHTML =
      '<div class="cbox" style="width:100%;">'
      + '<p style="color:var(--err);margin-bottom:14px;">Load failed: ' + esc(e.message) + '</p>'
      + '<button class="bn bnext" onclick="loadDashboard()">← Back to Dashboard</button>'
      + '</div>';
  });
}

function onExamLoaded(data) {
  testInfo = data.test; Qs = data.questions;
  if (!Qs || !Qs.length) {
    el('eBody').innerHTML =
      '<div class="cbox" style="width:100%;">'
      + '<p style="color:var(--err);margin-bottom:14px;">No questions found for this test.</p>'
      + '<button class="bn bnext" onclick="loadDashboard()">← Back to Dashboard</button>'
      + '</div>';
    return;
  }
  el('eTestName').textContent = testInfo ? testInfo.name : 'Test';
  timerSec = (testInfo && testInfo.duration_in_minutes ? parseInt(testInfo.duration_in_minutes) : 60) * 60;
  startMs = Date.now(); startTimer(); buildExam(); renderQ();
}

function startTimer() {
  stopTimer();
  timerInt = setInterval(function () {
    var rem = timerSec - Math.floor((Date.now() - startMs) / 1000);
    if (rem <= 0) { stopTimer(); autoSubmit(); return; }
    var m = Math.floor(rem / 60), s = rem % 60;
    el('eTimer').textContent = '⏰ ' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    el('eTimer').className = 'tpill' + (rem <= 120 ? ' danger' : rem <= 300 ? ' warn' : '');
  }, 1000);
}

function timeTaken() {
  var s = Math.floor((Date.now() - startMs) / 1000);
  return (Math.floor(s / 60) < 10 ? '0' : '') + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60) + ' min';
}

function buildExam() {
  el('eBody').innerHTML =
    '<div class="esb">'
    + '<div class="sbh">Question Palette</div>'
    + '<div class="sbsc" id="pal"></div>'
    + '<div class="sbst">'
    + '<div class="sbs"><div class="sv" id="sA">0</div><div class="sl">Done</div></div>'
    + '<div class="sbs"><div class="sv" id="sS">0</div><div class="sl">Skip</div></div>'
    + '<div class="sbs"><div class="sv" id="sL">' + Qs.length + '</div><div class="sl">Left</div></div>'
    + '</div>'
    + '<div class="sbleg">'
    + '<div class="leg"><div class="ld" style="background:linear-gradient(135deg,#3d5afe,#1a237e);"></div>Answered</div>'
    + '<div class="leg"><div class="ld" style="background:#fff8e1;border:1px solid #ffe082;"></div>Skipped</div>'
    + '<div class="leg"><div class="ld" style="background:#fafbff;border:1px solid #dde1ec;"></div>Unvisited</div>'
    + '</div></div>'
    + '<div class="econt">'
    + '<div class="qscroll" id="qA"></div>'
    + '<div class="eftr"><div class="nrow">'
    + '<button class="bn bprev" id="bPrev" onclick="prevQ()" disabled>← Prev</button>'
    + '<button class="bn bskip" onclick="skipQ()">Skip</button>'
    + '<button class="bn bnext" id="bNext" onclick="nextQ()">Next →</button>'
    + '</div><button class="bn bsub" onclick="showModal()">Submit Test</button></div></div>';
  buildPalette();
  buildMobilePalette();
}

function buildMobilePalette() {
  var grp = {}, ord = [];
  Qs.forEach(function (q, i) {
    if (!grp[q.section]) { grp[q.section] = []; ord.push(q.section); }
    grp[q.section].push({ q: q, i: i });
  });
  var h = '';
  ord.forEach(function (sec) {
    h += '<div class="sg"><div class="sgl">' + esc(sec) + '</div><div class="qgrid">';
    grp[sec].forEach(function (item) {
      var c = 'qb';
      if (ans[item.q.question_id] !== undefined) c += ' ans';
      else if (skp[item.q.question_id]) c += ' skp';
      if (item.i === idx) c += ' cur';
      h += '<div class="' + c + '" onclick="goQ(' + item.i + ');closeMobilePalette()">' + (item.i + 1) + '</div>';
    });
    h += '</div></div>';
  });
  var mpal = el('mobilePaletteContent'); if (mpal) mpal.innerHTML = h;
}

function buildPalette() {
  var grp = {}, ord = [];
  Qs.forEach(function (q, i) {
    if (!grp[q.section]) { grp[q.section] = []; ord.push(q.section); }
    grp[q.section].push({ q: q, i: i });
  });
  var h = '';
  ord.forEach(function (sec) {
    h += '<div class="sg"><div class="sgl">' + esc(sec) + '</div><div class="qgrid">';
    grp[sec].forEach(function (item) {
      var c = 'qb';
      if (ans[item.q.question_id] !== undefined) c += ' ans';
      else if (skp[item.q.question_id]) c += ' skp';
      if (item.i === idx) c += ' cur';
      h += '<div class="' + c + '" onclick="goQ(' + item.i + ')">' + (item.i + 1) + '</div>';
    });
    h += '</div></div>';
  });
  var pal = el('pal'); if (pal) pal.innerHTML = h;
  var a = Object.keys(ans).length, s = Object.keys(skp).length;
  if (el('sA')) { el('sA').textContent = a; el('sS').textContent = s; el('sL').textContent = Qs.length - a - s; }
}

function renderQ() {
  var q = Qs[idx];
  el('eProg').style.width = ((idx + 1) / Qs.length * 100).toFixed(1) + '%';
  el('bPrev').disabled = (idx === 0);
  el('bNext').textContent = idx === Qs.length - 1 ? 'Finish' : 'Next →';
  var LT = ['A', 'B', 'C', 'D', 'E'], oh = '';
  (q.options || []).forEach(function (o, i) {
    var sel = (ans[q.question_id] && ans[q.question_id].value === o) ? 'sel' : '';
    oh += '<div class="opt ' + sel + '" onclick="selOpt(this,\'' + escQ(o) + '\',' + q.question_id + ',' + i + ')">'
      + '<div class="oltr">' + LT[i] + '</div>'
      + '<div class="otxt">' + esc(o) + '</div></div>';
  });
  el('qA').innerHTML =
    '<div class="qmr"><span class="qnum">Q ' + (idx + 1) + ' / ' + Qs.length + '</span>'
    + '<span class="qst">' + esc(q.section) + '</span>'
    + '<span class="qsi">(Sec ' + q.section_id + ')</span></div>'
    + '<div class="qtxt">' + esc(q.question) + '</div>'
    + '<div class="opts">' + oh + '</div>';
  buildPalette();
  buildMobilePalette();
}

function selOpt(div, val, qid, optIdx) {
  document.querySelectorAll('.opt').forEach(function (o) {
    o.classList.remove('sel');
    var l = o.querySelector('.oltr'); l.style.background = ''; l.style.borderColor = ''; l.style.color = '';
  });
  div.classList.add('sel');
  var l = div.querySelector('.oltr');
  l.style.background = 'var(--sky)'; l.style.borderColor = 'var(--sky)'; l.style.color = '#fff';
  var q = Qs[idx];
  ans[qid] = { 
    value: val, 
    optionIndex: optIdx,
    correct_answer: q.correct_answer,
    positive_marks: q.positive_marks || 1,
    negative_marks: q.negative_marks || 0,
    marks: val === q.correct_answer ? (q.positive_marks || 1) : (q.negative_marks || 0)
  };
  delete skp[qid]; buildPalette();
}

function skipQ() { var q = Qs[idx]; skp[q.question_id] = true; delete ans[q.question_id]; buildPalette(); if (idx < Qs.length - 1) { idx++; renderQ(); } }
function prevQ() { if (idx > 0) { idx--; renderQ(); } }
function nextQ() { if (idx < Qs.length - 1) { idx++; renderQ(); } else showModal(); }
function goQ(i) { idx = i; renderQ(); }

// ── MOBILE PALETTE ─────────────────────────────────────────────
function toggleMobilePalette() {
  var sheet = el('mobilePaletteSheet');
  var backdrop = el('mobilePaletteBackdrop');
  if (sheet && backdrop) {
    sheet.classList.toggle('open');
    backdrop.classList.toggle('open');
    if (sheet.classList.contains('open')) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }
}

function closeMobilePalette() {
  var sheet = el('mobilePaletteSheet');
  var backdrop = el('mobilePaletteBackdrop');
  if (sheet && backdrop) {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.style.overflow = 'auto';
  }
}

// ── BACK CONFIRM — custom modal, NO confirm() ─────────────────
// confirm() is silently blocked/returns false in many browsers
// when the page runs inside a GAS iframe (sandboxed origin).
function confirmBack() {
  el('backOverlay').classList.add('on');
}
function closeBackModal() {
  el('backOverlay').classList.remove('on');
}
function doGoBack() {
  el('backOverlay').classList.remove('on');
  stopTimer();
  loadDashboard();
}

// ── SUBMIT MODAL ───────────────────────────────────────────────
function showModal() {
  var a = Object.keys(ans).length, s = Object.keys(skp).length;
  el('mAns').textContent = a; el('mSkp').textContent = s; el('mTot').textContent = Qs.length;
  el('subOverlay').classList.add('on');
}
function closeModal() { el('subOverlay').classList.remove('on'); }
function autoSubmit() { closeModal(); doSubmit(); }

// ── SUBMIT ─────────────────────────────────────────────────────
function doSubmit() {
  if (submitted) return;
  submitted = true;
  var msb = el('modalSubBtn'); if (msb) msb.textContent = '⏳ Submitting…';
  stopTimer();
  closeModal();

  var tt = timeTaken();
  var responses = Qs.map(function (q) {
    var a = ans[q.question_id];
    return {
      questionId: q.question_id,
      response: a ? a.value : '',
      correct_answer: q.correct_answer || '',
      marks: a ? a.marks : 0,
      section: q.section,
      section_id: q.section_id
    };
  });

  el('eBody').innerHTML = '<div class="cbox" style="width:100%;"><div class="ldr"></div><p>Saving &amp; sending email…</p></div>';

  callAPI('submitResult', {
    participantId: P.participant_id,
    testId: parseInt(testId),
    responses: responses,
    timeTaken: tt,
    organizationId: 'A7X2'
  }, function () {
    submitted = false;
    buildResultScreen(responses, tt);
  }, function (e) {
    // Even on failure, show the result screen — sheet may have saved
    submitted = false;
    buildResultScreen(responses, tt);
  });
}

function buildResultScreen(responses, tt) {
  var answered = 0, totalMarks = 0, sectionScores = {};
  responses.forEach(function (resp) {
    var isCorrect = resp.response === resp.correct_answer && resp.response !== '';
    var marks = isCorrect ? resp.marks : (resp.response !== '' ? 0 : 0);
    if (resp.response) { answered++; totalMarks += marks; }
    var sec = resp.section || 'General';
    if (!sectionScores[sec]) sectionScores[sec] = { marks: 0, answered: 0, total: 0 };
    sectionScores[sec].total++;
    if (resp.response) { sectionScores[sec].answered++; sectionScores[sec].marks += marks; }
  });

  var maxM = testInfo && testInfo.total_marks ? parseFloat(testInfo.total_marks) : 0;
  var pct = maxM > 0 ? ((totalMarks / maxM) * 100).toFixed(1) + '%' : 'N/A';

  function rb(v, l) { return '<div class="rbox"><div class="rv">' + esc(String(v)) + '</div><div class="rl">' + l + '</div></div>'; }
  function rr(k, v) { return '<div class="rrow"><span class="rk">' + k + '</span><span class="rv2">' + (v || '—') + '</span></div>'; }

  var secHtml = '';
  var secKeys = Object.keys(sectionScores);
  if (secKeys.length) {
    secHtml = '<div class="sec-scores"><div class="sec-scores-title">📊 Section-wise Scores</div>';
    secKeys.forEach(function (sec) {
      var sc = sectionScores[sec];
      secHtml += '<div class="sec-row">'
        + '<span class="sec-name">' + esc(sec) + '</span>'
        + '<span class="sec-val">' + sc.marks + ' pts · ' + sc.answered + '/' + sc.total + ' answered</span>'
        + '</div>';
    });
    secHtml += '</div>';
  }

  var tname = testInfo ? testInfo.name : 'Test';
  var now = new Date();
  var ds = now.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()] + ' ' + now.getFullYear();

  el('eBody').innerHTML =
    '<div class="rwrap"><div class="rcard">'
    + '<div class="rico">🎉</div>'
    + '<h2>Test Submitted!</h2>'
    + '<p class="rsub">Well done, ' + esc(P.name || '') + '!<br>Results have been emailed to you.</p>'
    + '<div class="rgrid">'
    + rb(responses.length, 'Questions') + rb(answered, 'Answered')
    + rb(responses.length - answered, 'Skipped') + rb(totalMarks + (maxM ? ' / ' + maxM : ''), 'Score')
    + rb(pct, 'Percentage') + rb(tt, 'Time Taken')
    + '</div>'
    + secHtml
    + '<div class="rst">Participant</div>'
    + rr('Name', P.name) + rr('Email', P.email) + rr('Mobile', P.mobile_number) + rr('Institution', P.institution)
    + '<div class="rst" style="margin-top:11px;">Test</div>'
    + rr('Test', tname) + rr('Date', ds)
    + '<div class="enotice">✔ Result emailed to <strong>' + esc(P.email || '') + '</strong></div>'
    + '<button class="bdash" onclick="loadDashboard()">← Back to Dashboard</button>'
    + '</div></div>';
}


// ── SUPPORT MODAL ──────────────────────────────────────────────
/**
 * Open Support Modal
 */
function openSupportModal() {
  const supportOverlay = el('supportOverlay');
  if (!supportOverlay) return;
  
  supportOverlay.classList.add('on');
  
  // Load FAQs and org support info
  callAPI('getFAQs', {}, function(faqData) {
    renderFAQList(faqData.faqs || []);
  }, function(err) {
    el('faqList').innerHTML = '<p style="color:var(--err);text-align:center;">Error loading FAQs. Please try again.</p>';
  });
  
  // Get organization ID from current participant/admin
  const orgId = 'A7X2'; // Using the same organization ID as the rest of the app
  callAPI('getOrgSupportInfo', { organizationId: orgId }, function(supportData) {
    if (supportData.success) {
      const contactNumber = supportData.contact_number;
      const orgName = supportData.organization_name;
      
      // Update organization name
      const orgNameEl = el('orgNameDisplay');
      if (orgNameEl) orgNameEl.textContent = orgName || 'Organization';
      
      // Update contact number display
      const contactNumberEl = el('contactNumberDisplay');
      if (contactNumberEl) contactNumberEl.textContent = contactNumber || 'N/A';
      
      // Update WhatsApp link
      const whatsappLink = el('whatsappLink');
      if (whatsappLink) {
        whatsappLink.href = generateWhatsAppLink(contactNumber);
        whatsappLink.textContent = '💬 Start Chat on WhatsApp';
      }
    }
  }, function(err) {
    el('orgNameDisplay').textContent = 'Contact Support';
  });
}

/**
 * Close Support Modal
 */
function closeSupportModal() {
  const supportOverlay = el('supportOverlay');
  if (supportOverlay) supportOverlay.classList.remove('on');
}

/**
 * Switch between FAQ and Contact tabs
 * @param {string} tabName - 'faq' or 'contact'
 */
function switchSupportTab(tabName) {
  // Update tab buttons
  const tabBtns = document.querySelectorAll('.support-tab-btn');
  tabBtns.forEach(btn => btn.classList.remove('active'));
  
  if (tabName === 'faq') {
    if (tabBtns[0]) tabBtns[0].classList.add('active');
  } else if (tabName === 'contact') {
    if (tabBtns[1]) tabBtns[1].classList.add('active');
  }
  
  // Update tab content
  const tabContents = document.querySelectorAll('.support-tab-content');
  tabContents.forEach(content => content.classList.remove('active'));
  
  const faqTab = el('faqTabContent');
  const contactTab = el('contactTabContent');
  
  if (tabName === 'faq' && faqTab) {
    faqTab.classList.add('active');
  } else if (tabName === 'contact' && contactTab) {
    contactTab.classList.add('active');
  }
}

/**
 * Render FAQ list
 * @param {array} faqs - Array of {question, answer} objects
 */
function renderFAQList(faqs) {
  const faqList = el('faqList');
  if (!faqList) return;
  
  if (!faqs || faqs.length === 0) {
    faqList.innerHTML = '<p style="color:var(--sub);text-align:center;">No FAQs available.</p>';
    return;
  }
  
  let html = '';
  faqs.forEach(function(faq, idx) {
    const faqId = 'faq-' + idx;
    html += '<div class="faq-item" id="' + faqId + '" onclick="toggleFAQItem(' + idx + ')">';
    html += '<div class="faq-question">';
    html += '<span class="faq-toggle">+</span>';
    html += '<span>' + esc(faq.question) + '</span>';
    html += '</div>';
    html += '<div class="faq-answer">' + esc(faq.answer) + '</div>';
    html += '</div>';
  });
  
  faqList.innerHTML = html;
}

/**
 * Toggle FAQ answer visibility
 * @param {number} idx - FAQ index
 */
function toggleFAQItem(idx) {
  const faqItem = el('faq-' + idx);
  if (faqItem) {
    faqItem.classList.toggle('expanded');
  }
}

/**
 * Generate WhatsApp link
 * @param {string} phoneNumber - Phone number without country code or formatting
 * @return {string} WhatsApp Web link
 */
function generateWhatsAppLink(phoneNumber) {
  if (!phoneNumber) return '#';
  
  // Clean phone number: remove all non-digit characters
  const cleanNumber = String(phoneNumber).replace(/\D/g, '');
  
  // Assume Indian number format (country code 91)
  // If number is 10 digits, prepend 91; if 12 digits, assume already has country code
  let formattedNumber = cleanNumber;
  if (cleanNumber.length === 10) {
    formattedNumber = '91' + cleanNumber;
  }
  
  return 'https://wa.me/' + formattedNumber;
}

/**
 * Copy WhatsApp number to clipboard
 */
function copyWhatsappNumber() {
  const contactNumberEl = el('contactNumberDisplay');
  if (!contactNumberEl) return;
  
  const phoneNumber = contactNumberEl.textContent.trim();
  if (!phoneNumber || phoneNumber === 'N/A') {
    alert('Phone number not available');
    return;
  }
  
  navigator.clipboard.writeText(phoneNumber).then(function() {
    // Show temporary feedback
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.style.opacity = '0.7';
    
    setTimeout(function() {
      btn.textContent = originalText;
      btn.style.opacity = '1';
    }, 2000);
  }).catch(function(err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy number');
  });
}

// ── PAGE INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
});

// ── REFRESH CONFIRMATION ───────────────────────────────────────
window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = 'Are you sure you want to refresh? Your progress may be lost.';
  return e.returnValue;
});
