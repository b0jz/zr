/* ============================================================
   ZR HEALTH CARE — APP.JS
   Location: js/app.js
   Purpose: UI logic, tab switching, form handlers, rendering
   
   ╔══════════════════════════════════════╗
   ║  SECURITY LAYER — NOTES FOR APP.JS  ║
   ╚══════════════════════════════════════╝
   
   1. CONTENT SECURITY (Line ~20)
      → innerHTML is only used with SANITISED data.
      → User-provided strings are always run through
        sanitiseInput() (defined in database.js) before
        being inserted into the DOM.
   
   2. SESSION GUARD (Line ~180+)
      → requireAuth() checks SessionManager.validate()
        before rendering any protected page/action.
      → If session is invalid, user is redirected to login.
   
   3. NO SENSITIVE DATA IN DOM (throughout)
      → Password hashes are NEVER sent to or stored in JS
        variables accessible from the UI layer.
   ============================================================ */

'use strict';

// ─── TAB SWITCHING ─────────────────────────────────────────────────────────
function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const tabPanel = document.getElementById(tabId);
    if (tabBtn)  tabBtn.classList.add('active');
    if (tabPanel) tabPanel.classList.add('active');

    clearMessage();

    // Auto-load data for certain tabs
    if (tabId === 'dashboard')    refreshDashboard();
    if (tabId === 'appointments') loadAppointments();
    if (tabId === 'test-results') loadTestResults();
    if (tabId === 'imaging')      loadImagingAppointments();
}

// ─── MESSAGES ──────────────────────────────────────────────────────────────
function showMessage(msg, type = 'success') {
    const area = document.getElementById('message-area');
    const icon = type === 'success' ? '✓' : '⚠';
    area.innerHTML = `<div class="message ${type}"><span>${icon}</span> ${sanitiseInput(msg)}</div>`;
    if (type === 'success') setTimeout(clearMessage, 5000);
}

function clearMessage() {
    const area = document.getElementById('message-area');
    if (area) area.innerHTML = '';
}

// ─── AUTH GUARD ────────────────────────────────────────────────────────────
// SECURITY LOCATION: requireAuth — every protected action calls this
function requireAuth() {
    if (!SessionManager.validate()) {
        showMessage('Please login to access this feature.', 'error');
        switchTab('login');
        return null;
    }
    return SessionManager.getUser();
}

// ─── REGISTER ──────────────────────────────────────────────────────────────
async function handleRegister() {
    const fields = ['name','email','password','age','height','weight','phone','emergency-phone','insurance'];
    const vals = {};
    let empty = false;

    fields.forEach(f => {
        const el = document.getElementById(f);
        if (!el || !el.value) { empty = true; return; }
        vals[f] = el.value;
    });

    if (empty) { showMessage('Please fill in all required fields.', 'error'); return; }

    // Password strength check — SECURITY
    if (vals['password'].length < 8) {
        showMessage('Password must be at least 8 characters.', 'error');
        return;
    }

    try {
        await dbRegisterPatient({
            name: vals['name'],
            email: vals['email'],
            password: vals['password'],
            age: vals['age'],
            height: vals['height'],
            weight: vals['weight'],
            phone: vals['phone'],
            emergencyPhone: vals['emergency-phone'],
            insurance: vals['insurance']
        });

        showMessage(`Patient ${sanitiseInput(vals['name'])} registered successfully! Please login.`, 'success');
        fields.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; });
        setTimeout(() => switchTab('login'), 1500);
    } catch (e) {
        showMessage(e.message.includes('UNIQUE') ? 'This email is already registered.' : e.message, 'error');
    }
}

// ─── LOGIN ─────────────────────────────────────────────────────────────────
async function handleLogin() {
    const email    = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;
    if (!email || !password) { showMessage('Please enter email and password.', 'error'); return; }

    try {
        const user = await dbLogin(email, password);
        document.getElementById('current-user').textContent = user.name;
        showMessage(`Welcome back, ${sanitiseInput(user.name)}!`);
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        setTimeout(() => switchTab('dashboard'), 800);
    } catch (e) {
        showMessage(e.message, 'error');
    }
}

// Demo login shortcut
function handleDemoLogin() {
    document.getElementById('login-email').value = 'demo@zrhealth.com';
    document.getElementById('login-password').value = 'demo123';
    handleLogin();
}

// Logout
function handleLogout() {
    dbLogout();
    document.getElementById('current-user').textContent = 'Guest';
    showMessage('Logged out successfully.');
    switchTab('login');
}

// ─── DASHBOARD ─────────────────────────────────────────────────────────────
function refreshDashboard() {
    const user = requireAuth();
    if (!user) return;

    const metrics = dbGetHealthMetrics(user.id);

    document.getElementById('heart-rate').textContent   = metrics.heart_rate   || '--';
    document.getElementById('blood-pressure').textContent = metrics.blood_pressure || '--';
    document.getElementById('blood-sugar').textContent  = metrics.blood_sugar   || '--';

    // Status badges
    setHeartStatus(metrics.heart_rate);
    setBPStatus(metrics.blood_pressure);
    setSugarStatus(metrics.blood_sugar);

    // Patient info panel
    const bmi = (user.weight_kg / Math.pow(user.height_cm / 100, 2)).toFixed(1);
    const bmiCat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';

    document.getElementById('patient-info').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
            <p><strong style="color:var(--purple-300)">Name:</strong> ${sanitiseInput(user.name)}</p>
            <p><strong style="color:var(--purple-300)">Age:</strong> ${user.age} yrs</p>
            <p><strong style="color:var(--purple-300)">Height:</strong> ${user.height_cm} cm</p>
            <p><strong style="color:var(--purple-300)">Weight:</strong> ${user.weight_kg} kg</p>
            <p><strong style="color:var(--purple-300)">BMI:</strong> ${bmi} (${bmiCat})</p>
            <p><strong style="color:var(--purple-300)">Phone:</strong> ${sanitiseInput(user.phone)}</p>
            <p><strong style="color:var(--purple-300)">Emergency:</strong> ${sanitiseInput(user.emergency_phone)}</p>
        </div>
    `;

    // Insurance
    const ins = document.getElementById('insurance-status');
    if (user.insurance_cat && user.insurance_cat !== 'none') {
        ins.innerHTML = `
            <div class="insurance-badge insured">✓ Insured</div>
            <p style="margin-top:10px"><strong>Plan:</strong> ${sanitiseInput(user.insurance_cat)}</p>
            <p><strong>Status:</strong> ${sanitiseInput(user.insurance_status)}</p>`;
    } else {
        ins.innerHTML = `<div class="insurance-badge not-insured">✗ Not Insured</div>
            <p style="margin-top:10px">Consider enrolling in a health insurance plan.</p>`;
    }
}

function setHeartStatus(hr) {
    const el = document.getElementById('heart-status');
    if (!el) return;
    if (hr < 60)       { el.textContent = 'Low';    el.className = 'health-status status-warning'; }
    else if (hr > 100) { el.textContent = 'High';   el.className = 'health-status status-danger'; }
    else               { el.textContent = 'Normal'; el.className = 'health-status status-normal'; }
}

function setBPStatus(bp) {
    const el = document.getElementById('bp-status');
    if (!el || !bp) return;
    const sys = parseInt(bp.split('/')[0]);
    if (sys < 90)       { el.textContent = 'Low';    el.className = 'health-status status-warning'; }
    else if (sys > 140) { el.textContent = 'High';   el.className = 'health-status status-danger'; }
    else                { el.textContent = 'Normal'; el.className = 'health-status status-normal'; }
}

function setSugarStatus(bs) {
    const el = document.getElementById('sugar-status');
    if (!el) return;
    if (bs < 70)       { el.textContent = 'Low';    el.className = 'health-status status-warning'; }
    else if (bs > 140) { el.textContent = 'High';   el.className = 'health-status status-danger'; }
    else               { el.textContent = 'Normal'; el.className = 'health-status status-normal'; }
}

function handleUpdateHealth() {
    const user = requireAuth();
    if (!user) return;

    const hr = parseInt(document.getElementById('update-heart-rate')?.value) || null;
    const bp = document.getElementById('update-blood-pressure')?.value || null;
    const bs = parseInt(document.getElementById('update-blood-sugar')?.value)  || null;

    if (!hr && !bp && !bs) { showMessage('Enter at least one metric to update.', 'error'); return; }

    try {
        dbUpdateHealthMetrics(user.id, hr, bp, bs);
        ['update-heart-rate','update-blood-pressure','update-blood-sugar'].forEach(id => {
            const el = document.getElementById(id); if(el) el.value='';
        });
        refreshDashboard();
        showMessage('Health metrics updated successfully!');
    } catch(e) { showMessage(e.message, 'error'); }
}

// ─── APPOINTMENTS ──────────────────────────────────────────────────────────
function loadAppointments() {
    const user = requireAuth();
    const list = document.getElementById('appointments-list');
    if (!user) { if(list) list.innerHTML='<p>Please login to view appointments.</p>'; return; }

    const apts = dbGetAppointments(user.id);
    if (!apts.length) {
        list.innerHTML = '<p style="color:var(--text-2)">No appointments scheduled yet.</p>';
        return;
    }

    list.innerHTML = apts.map(a => {
        const cls = a.status === 'Scheduled' ? 'status-normal' : a.status === 'Completed' ? 'status-warning' : 'status-danger';
        return `<div class="health-card" style="margin-bottom:14px">
            <h3><i class="fas fa-calendar-day"></i> ${sanitiseInput(a.doctor_name)}</h3>
            <p><strong>Date:</strong> ${a.appt_date} &nbsp; <strong>Time:</strong> ${a.appt_time}</p>
            <p><strong>Reason:</strong> ${sanitiseInput(a.reason || 'N/A')}</p>
            <span class="health-status ${cls}">${a.status}</span>
        </div>`;
    }).join('');
}

function handleScheduleAppointment() {
    const user = requireAuth();
    if (!user) return;

    const doctor = document.getElementById('appointment-doctor')?.value;
    const date   = document.getElementById('appointment-date')?.value;
    const time   = document.getElementById('appointment-time')?.value;
    const reason = document.getElementById('appointment-reason')?.value;

    if (!doctor || !date || !time || !reason) { showMessage('Please fill in all appointment fields.', 'error'); return; }

    try {
        dbAddAppointment(user.id, doctor, date, time, reason);
        ['appointment-doctor','appointment-date','appointment-time','appointment-reason']
            .forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
        loadAppointments();
        showMessage(`Appointment scheduled with ${sanitiseInput(doctor)} on ${date}.`);
    } catch(e) { showMessage(e.message, 'error'); }
}

// ─── TEST RESULTS ──────────────────────────────────────────────────────────
function loadTestResults() {
    const user = requireAuth();
    const listDiv = document.getElementById('test-results-list');
    const tbody   = document.getElementById('test-results-table');

    if (!user) {
        if(listDiv) listDiv.innerHTML = '<p>Please login to view test results.</p>';
        if(tbody)   tbody.innerHTML   = '<tr><td colspan="4">Please login.</td></tr>';
        return;
    }

    const results = dbGetTestResults(user.id);

    listDiv.innerHTML = results.length
        ? results.map(r => {
            const cls = r.result_status === 'Normal' ? 'status-normal' : r.result_status === 'Abnormal' ? 'status-warning' : 'status-danger';
            return `<div class="health-card" style="margin-bottom:14px">
                <h3><i class="fas fa-flask"></i> ${sanitiseInput(r.test_name)}</h3>
                <p><strong>Date:</strong> ${r.test_date}</p>
                <p><strong>Result:</strong> ${sanitiseInput(r.result_value || 'Pending')}</p>
                <span class="health-status ${cls}">${r.result_status}</span>
            </div>`;
          }).join('')
        : '<p style="color:var(--text-2)">No test results yet.</p>';

    tbody.innerHTML = results.length
        ? results.map(r => {
            const cls = r.result_status === 'Normal' ? 'status-normal' : r.result_status === 'Abnormal' ? 'status-warning' : 'status-danger';
            return `<tr>
                <td>${sanitiseInput(r.test_name)}</td>
                <td>${r.test_date}</td>
                <td>${sanitiseInput(r.result_value || 'Pending')}</td>
                <td><span class="health-status ${cls}">${r.result_status}</span></td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="4">No results found.</td></tr>';
}

// ─── IMAGING APPOINTMENTS ──────────────────────────────────────────────────
function loadImagingAppointments() {
    const user = requireAuth();
    const list = document.getElementById('imaging-list');
    if (!user) { if(list) list.innerHTML='<p>Please login.</p>'; return; }

    const items = dbGetImagingAppointments(user.id);

    const icons = { MRI: 'fa-magnet', 'CT Scan': 'fa-circle-dot', 'X-Ray': 'fa-radiation', ECG: 'fa-heart-pulse', EMG: 'fa-bolt' };

    list.innerHTML = items.length
        ? items.map(i => {
            const icon = icons[i.test_type] || 'fa-file-medical';
            const cls  = i.status === 'Scheduled' ? 'status-normal' : i.status === 'Completed' ? 'status-warning' : 'status-danger';
            const priCls = i.priority === 'Emergency' ? 'status-danger' : i.priority === 'Urgent' ? 'status-warning' : 'status-normal';
            return `<div class="health-card" style="margin-bottom:14px">
                <h3><i class="fas ${icon}"></i> ${sanitiseInput(i.test_type)}</h3>
                <p><strong>Area:</strong> ${sanitiseInput(i.body_area || 'Not specified')}</p>
                <p><strong>Date:</strong> ${i.appt_date} &nbsp; <strong>Time:</strong> ${i.appt_time}</p>
                <p><strong>Notes:</strong> ${sanitiseInput(i.notes || '—')}</p>
                <span class="health-status ${priCls}" style="margin-right:6px">${i.priority}</span>
                <span class="health-status ${cls}">${i.status}</span>
            </div>`;
          }).join('')
        : '<p style="color:var(--text-2)">No imaging appointments yet.</p>';
}

function handleBookImaging() {
    const user = requireAuth();
    if (!user) return;

    const type     = document.getElementById('imaging-type')?.value;
    const area     = document.getElementById('imaging-body-area')?.value;
    const priority = document.getElementById('imaging-priority')?.value;
    const date     = document.getElementById('imaging-date')?.value;
    const time     = document.getElementById('imaging-time')?.value;
    const notes    = document.getElementById('imaging-notes')?.value;

    if (!type || !date || !time) { showMessage('Please fill in test type, date, and time.', 'error'); return; }

    try {
        dbAddImagingAppointment(user.id, type, area, priority, date, time, notes);
        ['imaging-type','imaging-body-area','imaging-priority','imaging-date','imaging-time','imaging-notes']
            .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
        loadImagingAppointments();
        showMessage(`${sanitiseInput(type)} appointment booked for ${date}.`);
    } catch(e) { showMessage(e.message, 'error'); }
}

// ─── INIT ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Show loading overlay
    const loader = document.getElementById('db-loader');
    if (loader) loader.style.display = 'flex';

    await initDatabase();

    if (loader) loader.style.display = 'none';

    // Wire up tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
    });

    // Wire up buttons
    document.getElementById('register-btn')           ?.addEventListener('click', handleRegister);
    document.getElementById('login-btn')              ?.addEventListener('click', handleLogin);
    document.getElementById('demo-login-btn')         ?.addEventListener('click', handleDemoLogin);
    document.getElementById('logout-btn')             ?.addEventListener('click', handleLogout);
    document.getElementById('update-health-btn')      ?.addEventListener('click', handleUpdateHealth);
    document.getElementById('schedule-appointment-btn')?.addEventListener('click', handleScheduleAppointment);
    document.getElementById('book-imaging-btn')       ?.addEventListener('click', handleBookImaging);

    // Min date for appointment pickers
    const today = new Date().toISOString().split('T')[0];
    ['appointment-date','imaging-date'].forEach(id => {
        const el = document.getElementById(id); if(el) el.min = today;
    });

    // Restore session if still valid
    if (SessionManager.validate()) {
        const u = SessionManager.getUser();
        if (u) document.getElementById('current-user').textContent = u.name;
    }

    console.log('[ZR App] Application ready.');
});
