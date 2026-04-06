# SFMC Inspector

> The definitive developer toolkit for Salesforce Marketing Cloud Engagement.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-orange)

---

## What it does

SFMC Inspector runs inside your browser while you're logged into Salesforce Marketing Cloud. It reads your existing session — no OAuth setup, no credentials to enter — and gives you superpowers the native UI doesn't have.

### Features (v0.1.0)

| Feature | Description |
|---|---|
| **Session Detection** | Automatically detects your SFMC session from any open SFMC tab |
| **Data Extension Explorer** | Browse all DEs with quick search |
| **DE → Automation Map** | For any DE, see which Query Activities write to it and their SQL |
| **DE → Journey Map** | See which Journeys reference a DE as entry source or activity |
| **Automation Monitor** | Browse automations with status, schedule, and inline SQL preview |
| **SQL Linter** | 10-rule static analysis for SFMC Query Activity SQL |
| **AMPScript Linter** | 10-rule static analysis for AMPScript V1 blocks |
| **Global Search** | ⌘K search across DEs, Automations, Journeys simultaneously |

---

## How authentication works

SFMC Inspector uses the **same session your browser already has** when you're logged into SFMC. It reads the access token from the page environment (localStorage / cookies) exactly like Salesforce Inspector Reloaded does for Salesforce CRM.

- ✅ No OAuth setup required
- ✅ No credentials stored
- ✅ No data sent to third parties
- ✅ Respects your SFMC permissions — you can only see what your user can access
- ✅ Detects session expiry and prompts you to refresh

---

## Installation (development)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `sfmc-inspector/` folder
6. Open Salesforce Marketing Cloud in a tab
7. Click the SFMC Inspector icon in your toolbar

---

## Project structure

```
sfmc-inspector/
├── manifest.json                 # Manifest V3
├── background/
│   └── service-worker.js         # Session management, API proxy
├── content/
│   └── detector.js               # SFMC page detector, token extractor
├── panel/
│   ├── popup.html                # Extension popup UI
│   ├── popup.css                 # Styles (dark theme, Geist + JetBrains Mono)
│   └── popup.js                  # UI controller
├── shared/
│   ├── sfmc-api.js               # REST API wrapper
│   ├── sql-linter.js             # SQL static analysis (10 rules)
│   └── ampscript-linter.js       # AMPScript static analysis (10 rules)
└── assets/
    └── icons/                    # Extension icons (to be added)
```

---

## Linter rules

### SQL (Query Activities)

| Rule | Severity | Description |
|---|---|---|
| SQL001 | 🔴 Error | SELECT * used |
| SQL002 | 🟡 Warning | Missing NOLOCK on data views |
| SQL003 | 🔴 Error | NULL comparison with = or != |
| SQL004 | 🟡 Warning | No WHERE clause on high-volume data view |
| SQL005 | 🟡 Warning | Implicit type coercion in JOIN |
| SQL006 | 🔵 Info | DISTINCT on high-volume table |
| SQL007 | 🟡 Warning | Subquery in WHERE instead of JOIN |
| SQL009 | 🔵 Info | TOP without ORDER BY |
| SQL010 | 🟡 Warning | GETDATE() without timezone context |

### AMPScript (Emails / CloudPages / Templates)

| Rule | Severity | Description |
|---|---|---|
| AMP001 | 🔴 Error | Variable used without VAR declaration |
| AMP002 | 🔴 Error | IF block without ENDIF |
| AMP003 | 🔴 Error | FOR block without NEXT |
| AMP004 | 🟡 Warning | Output without EncodeValue() |
| AMP005 | 🟡 Warning | Hardcoded email address or ClientID |
| AMP006 | 🔴 Error | LookupRows without null check |
| AMP007 | 🟡 Warning | Lowercase AMPScript keywords |
| AMP008 | 🔵 Info | TreatAsContent() usage detected |
| AMP009 | 🟡 Warning | Data write without error handling |
| AMP010 | 🔵 Info | V2 syntax detected |

---

## Roadmap

- [ ] Icons (v0.1.1)
- [ ] Journey dependency map (visual tree)
- [ ] DE Health Dashboard (NULL columns, orphaned DEs)
- [ ] Broken link detector for emails
- [ ] Export metadata to JSON/CSV
- [ ] Firefox support
- [ ] Chrome Web Store listing

---

## Contributing

PRs welcome. Before starting work on a feature, open an issue to discuss the approach.

**Code standards:**
- Vanilla JS only (no frameworks in content/background scripts)
- No `let`/`const`/arrow functions in content scripts (keep IE11-era compat for SFMC's older iframe contexts)
- All SFMC API calls go through `sfmc-api.js`

---

## License

MIT — free for everyone, forever.
