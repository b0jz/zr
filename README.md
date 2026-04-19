# ZR Health Care — Project Structure & Security Guide

## 📁 File Structure

```
zr-healthcare/
│
├── index.html          ← Main entry point (HTML structure, CSP header)
│
├── css/
│   └── theme.css       ← All styling: dark/light mode, purple/black theme, layout
│
└── js/
    ├── database.js     ← SQL database + ALL security controls
    └── app.js          ← UI logic, form handlers, tab switching
```

---

## 🗄 Database

Uses **sql.js** (SQLite compiled to WebAssembly), running entirely in the browser.
The SQL schema lives in `js/database.js` inside `initDatabase()`.

### Tables
| Table | Purpose |
|---|---|
| `patients` | Registration data, hashed passwords |
| `health_metrics` | Heart rate, BP, blood sugar (time-series) |
| `appointments` | Doctor appointments |
| `test_results` | Lab test results |
| `imaging_appointments` | MRI, CT, X-Ray, ECG, EMG bookings |

---

## 🔐 Security Map (where each control lives)

| Security Feature | File | Location |
|---|---|---|
| Password Hashing (SHA-256 + salt) | `js/database.js` | `hashPassword()` ~line 50 |
| SQL Injection Prevention | `js/database.js` | All `db.run("SQL ?", [params])` calls |
| XSS Input Sanitisation | `js/database.js` | `sanitiseInput()` ~line 40 |
| Session Token (256-bit random) | `js/database.js` | `SessionManager` object ~line 90 |
| Session Expiry (2 hours) | `js/database.js` | `SessionManager.validate()` |
| Brute-Force / Rate Limiting | `js/database.js` | `LoginRateLimiter` ~line 62 |
| Auth Guard (protected routes) | `js/app.js` | `requireAuth()` ~line 60 |
| Content Security Policy | `index.html` | `<meta http-equiv="CSP">` in `<head>` |
| DB Constraints & CHECK clauses | `js/database.js` | `initDatabase()` schema |

---

## 🎨 Theme

- **Default**: Black & Purple (dark mode)
- **Light mode**: White & Purple (auto via `@media (prefers-color-scheme: light)`)
- **CSS variables**: All in `css/theme.css` under `:root` and `body`

---

## 🚀 Running

Open `index.html` directly in a browser, or serve with any static file server:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

---

## ⚠️ Production Notes

In a real deployment:
- Move `js/database.js` logic to a **server-side backend** (Node.js, Python, PHP)
- Use **MySQL or PostgreSQL** instead of SQLite/sql.js
- Add **HTTPS** (TLS) — mandatory for healthcare data
- Use **bcrypt** instead of SHA-256 for password hashing (slower = safer)
- Add **server-side session management** (not sessionStorage)
- Implement **HIPAA-compliant** logging and audit trails
