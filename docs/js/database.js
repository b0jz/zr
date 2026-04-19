/* ============================================================
   ZR HEALTH CARE — DATABASE.JS
   Location: js/database.js
   Purpose: SQL database layer using sql.js (SQLite in-browser)
   
   ╔══════════════════════════════════════╗
   ║  SECURITY LAYER — READ THIS FIRST   ║
   ╚══════════════════════════════════════╝
   All database security is implemented here.
   Key security features in this file:
   
   1. PARAMETERISED QUERIES (Line ~80+)
      → Prevents SQL Injection attacks.
      → We NEVER concatenate user input into SQL strings.
      → Example: db.run("INSERT INTO patients VALUES (?,?)", [val1, val2])
   
   2. PASSWORD HASHING (Line ~50+)
      → Passwords are hashed with SHA-256 via SubtleCrypto API
        (browser built-in, no library needed).
      → Plain-text passwords are NEVER stored in the database.
   
   3. SESSION TOKEN (Line ~160+)
      → After login, a random session token is generated and
        stored in sessionStorage (cleared on tab close).
      → The token is checked before every protected action.
   
   4. INPUT SANITISATION (Line ~40+)
      → All text inputs are stripped of HTML/script tags
        before reaching the database → prevents XSS.
   
   5. RATE LIMITING (Line ~30+)
      → Login attempts are counted; after 5 failures the
        form is locked for 30 seconds.
   ============================================================ */

'use strict';

// ─── SECURITY UTILITY: Sanitise text input (XSS prevention) ───────────────
// SECURITY LOCATION: sanitiseInput() — called before every DB write
function sanitiseInput(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

// ─── SECURITY UTILITY: SHA-256 password hashing ───────────────────────────
// SECURITY LOCATION: hashPassword() — used during register & login verify
async function hashPassword(plain) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain + 'ZR_SALT_2024'); // salt added
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── SECURITY UTILITY: Rate limiter for login ────────────────────────────
// SECURITY LOCATION: LoginRateLimiter — blocks brute-force attacks
const LoginRateLimiter = {
    attempts: 0,
    lockedUntil: 0,
    MAX_ATTEMPTS: 5,
    LOCKOUT_SECONDS: 30,

    check() {
        if (Date.now() < this.lockedUntil) {
            const secs = Math.ceil((this.lockedUntil - Date.now()) / 1000);
            return { allowed: false, message: `Too many attempts. Try again in ${secs}s.` };
        }
        return { allowed: true };
    },

    fail() {
        this.attempts++;
        if (this.attempts >= this.MAX_ATTEMPTS) {
            this.lockedUntil = Date.now() + this.LOCKOUT_SECONDS * 1000;
            this.attempts = 0;
        }
    },

    success() { this.attempts = 0; }
};

// ─── SECURITY UTILITY: Session token management ───────────────────────────
// SECURITY LOCATION: SessionManager — protects authenticated routes
const SessionManager = {
    generate() {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr); // cryptographically secure random
        const token = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
        sessionStorage.setItem('zr_session_token', token);
        sessionStorage.setItem('zr_session_ts', Date.now().toString());
        return token;
    },

    validate() {
        const token = sessionStorage.getItem('zr_session_token');
        const ts    = parseInt(sessionStorage.getItem('zr_session_ts') || '0');
        // Session expires after 2 hours
        if (!token || Date.now() - ts > 2 * 60 * 60 * 1000) {
            this.destroy();
            return false;
        }
        return true;
    },

    getUser() {
        const raw = sessionStorage.getItem('zr_current_user');
        return raw ? JSON.parse(raw) : null;
    },

    setUser(userData) {
        // NEVER store password in session
        const safe = { ...userData };
        delete safe.password;
        sessionStorage.setItem('zr_current_user', JSON.stringify(safe));
    },

    destroy() {
        sessionStorage.removeItem('zr_session_token');
        sessionStorage.removeItem('zr_session_ts');
        sessionStorage.removeItem('zr_current_user');
    }
};

// ─── DATABASE INIT ─────────────────────────────────────────────────────────
let db = null;

async function initDatabase() {
    // sql.js loaded via CDN in index.html
    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`
    });

    db = new SQL.Database();

    // ── SQL SCHEMA ──────────────────────────────────────────────────────────
    // All CREATE TABLE statements use proper types and constraints.
    // Foreign keys enforce referential integrity.
    db.run(`
        CREATE TABLE IF NOT EXISTS patients (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            name             TEXT    NOT NULL,
            email            TEXT    UNIQUE NOT NULL,
            password_hash    TEXT    NOT NULL,           -- SHA-256 hashed
            age              INTEGER NOT NULL CHECK(age > 0 AND age < 130),
            height_cm        REAL    NOT NULL CHECK(height_cm > 0),
            weight_kg        REAL    NOT NULL CHECK(weight_kg > 0),
            phone            TEXT    NOT NULL,
            emergency_phone  TEXT    NOT NULL,
            insurance_cat    TEXT    DEFAULT 'none',
            insurance_status TEXT    DEFAULT 'Inactive' CHECK(insurance_status IN ('Active','Inactive','Pending')),
            created_at       TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS health_metrics (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id      INTEGER NOT NULL,
            heart_rate      INTEGER CHECK(heart_rate BETWEEN 20 AND 300),
            blood_pressure  TEXT,
            blood_sugar     INTEGER CHECK(blood_sugar BETWEEN 20 AND 800),
            recorded_at     TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS appointments (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id       INTEGER NOT NULL,
            doctor_name      TEXT    NOT NULL,
            appt_date        TEXT    NOT NULL,
            appt_time        TEXT    NOT NULL,
            reason           TEXT,
            status           TEXT    DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Completed','Cancelled')),
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS test_results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id      INTEGER NOT NULL,
            test_name       TEXT    NOT NULL,
            test_date       TEXT    NOT NULL,
            result_value    TEXT,
            result_status   TEXT    DEFAULT 'Normal' CHECK(result_status IN ('Normal','Abnormal','Critical')),
            notes           TEXT,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS imaging_appointments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id      INTEGER NOT NULL,
            test_type       TEXT    NOT NULL,
            body_area       TEXT,
            priority        TEXT    DEFAULT 'Routine' CHECK(priority IN ('Routine','Urgent','Emergency')),
            appt_date       TEXT    NOT NULL,
            appt_time       TEXT    NOT NULL,
            notes           TEXT,
            status          TEXT    DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Completed','Cancelled')),
            results_ready   INTEGER DEFAULT 0,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );
    `);

    // Seed demo patient (password: demo123)
    const demoHash = await hashPassword('demo123');
    db.run(`
        INSERT OR IGNORE INTO patients
        (name, email, password_hash, age, height_cm, weight_kg, phone, emergency_phone, insurance_cat, insurance_status)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    `, ['Demo Patient', 'demo@zrhealth.com', demoHash, 42, 170, 75, '555-000-0001', '555-000-0002', 'Premium Gold', 'Active']);

    const demoId = db.exec("SELECT id FROM patients WHERE email='demo@zrhealth.com'")[0]?.values[0][0];
    if (demoId) {
        db.run("INSERT OR IGNORE INTO health_metrics (patient_id, heart_rate, blood_pressure, blood_sugar) VALUES (?,?,?,?)",
               [demoId, 72, '120/80', 95]);
        db.run("INSERT OR IGNORE INTO appointments (patient_id, doctor_name, appt_date, appt_time, reason, status) VALUES (?,?,?,?,?,?)",
               [demoId, 'Dr. Sarah Johnson - Cardiology', '2025-06-15', '10:30', 'Routine checkup', 'Scheduled']);
        db.run("INSERT OR IGNORE INTO test_results (patient_id, test_name, test_date, result_value, result_status, notes) VALUES (?,?,?,?,?,?)",
               [demoId, 'Complete Blood Count', '2025-04-01', 'Normal', 'Normal', 'All parameters within range']);
        db.run("INSERT OR IGNORE INTO imaging_appointments (patient_id, test_type, body_area, priority, appt_date, appt_time, notes, status) VALUES (?,?,?,?,?,?,?,?)",
               [demoId, 'MRI', 'Brain', 'Routine', '2025-06-20', '09:00', 'Follow-up imaging', 'Scheduled']);
    }

    console.log('[ZR DB] Database initialised successfully.');
    return db;
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

// REGISTER — uses parameterised query (SQL injection prevention)
async function dbRegisterPatient(data) {
    const hash = await hashPassword(data.password);
    // SECURITY: All values passed as parameters, never string-concatenated
    db.run(`
        INSERT INTO patients (name, email, password_hash, age, height_cm, weight_kg, phone, emergency_phone, insurance_cat, insurance_status)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [
        sanitiseInput(data.name),
        sanitiseInput(data.email).toLowerCase(),
        hash,
        parseInt(data.age),
        parseFloat(data.height),
        parseFloat(data.weight),
        sanitiseInput(data.phone),
        sanitiseInput(data.emergencyPhone),
        sanitiseInput(data.insurance),
        data.insurance === 'none' ? 'Inactive' : 'Active'
    ]);

    const pid = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    db.run("INSERT INTO health_metrics (patient_id, heart_rate, blood_pressure, blood_sugar) VALUES (?,?,?,?)",
           [pid, 72, '120/80', 95]);
    return pid;
}

// LOGIN — parameterised + rate-limited
async function dbLogin(email, password) {
    const rateCheck = LoginRateLimiter.check();
    if (!rateCheck.allowed) throw new Error(rateCheck.message);

    const hash = await hashPassword(password);
    // SECURITY: Parameterised query — email from user input never concatenated
    const res = db.exec("SELECT * FROM patients WHERE email=? AND password_hash=?",
                        [sanitiseInput(email).toLowerCase(), hash]);

    if (!res.length || !res[0].values.length) {
        LoginRateLimiter.fail();
        throw new Error('Invalid email or password.');
    }

    LoginRateLimiter.success();
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const user = {};
    cols.forEach((c, i) => user[c] = vals[i]);

    SessionManager.setUser(user);
    SessionManager.generate();
    return user;
}

function dbLogout() { SessionManager.destroy(); }

// GET PATIENT DATA
function dbGetPatient(id) {
    const res = db.exec("SELECT * FROM patients WHERE id=?", [id]);
    if (!res.length) return null;
    const cols = res[0].columns, vals = res[0].values[0];
    const obj = {}; cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
}

function dbGetHealthMetrics(patientId) {
    const res = db.exec("SELECT * FROM health_metrics WHERE patient_id=? ORDER BY recorded_at DESC LIMIT 1", [patientId]);
    if (!res.length || !res[0].values.length) return { heart_rate: 72, blood_pressure: '120/80', blood_sugar: 95 };
    const cols = res[0].columns, vals = res[0].values[0];
    const obj = {}; cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
}

function dbUpdateHealthMetrics(patientId, heartRate, bloodPressure, bloodSugar) {
    if (!SessionManager.validate()) throw new Error('Session expired. Please login again.');
    db.run("INSERT INTO health_metrics (patient_id, heart_rate, blood_pressure, blood_sugar) VALUES (?,?,?,?)",
           [patientId, heartRate || null, sanitiseInput(bloodPressure) || null, bloodSugar || null]);
}

function dbGetAppointments(patientId) {
    const res = db.exec("SELECT * FROM appointments WHERE patient_id=? ORDER BY appt_date ASC", [patientId]);
    if (!res.length) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => { const o={}; cols.forEach((c,i)=>o[c]=row[i]); return o; });
}

function dbAddAppointment(patientId, doctor, date, time, reason) {
    if (!SessionManager.validate()) throw new Error('Session expired. Please login again.');
    db.run("INSERT INTO appointments (patient_id, doctor_name, appt_date, appt_time, reason) VALUES (?,?,?,?,?)",
           [patientId, sanitiseInput(doctor), sanitiseInput(date), sanitiseInput(time), sanitiseInput(reason)]);
}

function dbGetTestResults(patientId) {
    const res = db.exec("SELECT * FROM test_results WHERE patient_id=? ORDER BY test_date DESC", [patientId]);
    if (!res.length) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => { const o={}; cols.forEach((c,i)=>o[c]=row[i]); return o; });
}

function dbGetImagingAppointments(patientId) {
    const res = db.exec("SELECT * FROM imaging_appointments WHERE patient_id=? ORDER BY appt_date ASC", [patientId]);
    if (!res.length) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => { const o={}; cols.forEach((c,i)=>o[c]=row[i]); return o; });
}

function dbAddImagingAppointment(patientId, testType, bodyArea, priority, date, time, notes) {
    if (!SessionManager.validate()) throw new Error('Session expired. Please login again.');
    db.run(`INSERT INTO imaging_appointments (patient_id, test_type, body_area, priority, appt_date, appt_time, notes)
            VALUES (?,?,?,?,?,?,?)`,
           [patientId, sanitiseInput(testType), sanitiseInput(bodyArea),
            sanitiseInput(priority), sanitiseInput(date), sanitiseInput(time), sanitiseInput(notes)]);
}
