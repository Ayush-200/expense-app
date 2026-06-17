## CSV Import Feature Documentation

## Overview

The CSV import feature allows users to bulk import expenses from a CSV file with comprehensive anomaly detection and validation. The system detects issues, auto-fixes safe problems, and requires approval for ambiguous cases.

---

## Key Principles

1. **Never silently modify data** — all changes are logged and reported
2. **Detect anomalies** — comprehensive rule-based validation
3. **Auto-fix when safe** — apply fixes only for unambiguous issues
4. **Require approval when necessary** — surface ambiguous cases to users
5. **Full traceability** — complete audit trail of all imports and fixes

---

## CSV Format

### Required Columns

```csv
date,description,paidBy,amount
```

### Optional Columns

```csv
currency,splitType,participants
```

### Example CSV

```csv
date,description,paidBy,amount,currency,splitType,participants
2024-01-15,Team lunch,Alice,1200.50,INR,EQUAL,"Alice,Bob,Carol"
2024-01-16,Office supplies,Bob,450.00,INR,EQUAL,"Alice,Bob"
2024-01-17,Coffee,Carol,180.00,INR,EQUAL,"Alice,Carol"
```

---

## Anomaly Type