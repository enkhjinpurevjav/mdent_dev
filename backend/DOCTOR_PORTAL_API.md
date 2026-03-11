# Doctor Portal API (`/api/doctor/*`)

All routes require:
- A valid JWT cookie (`access_token`) or `Authorization: Bearer <token>` header
- User role must be `doctor`

## Manual testing with curl

Replace `$TOKEN` with a valid doctor JWT. Set a base URL (e.g. `http://localhost:8080`).

```bash
export TOKEN="eyJ..."
export BASE="http://localhost:8080"
```

### A) Appointments list

```bash
# Today's appointments (hide cancelled, show no_show and others)
curl -s "$BASE/api/doctor/appointments?from=2026-03-11&to=2026-03-11" \
  -H "Cookie: access_token=$TOKEN" | jq .

# With encounter data (encounterId, materialsCount)
curl -s "$BASE/api/doctor/appointments?from=2026-03-11&to=2026-03-11&withEncounterData=true" \
  -H "Cookie: access_token=$TOKEN" | jq .
```

Expected: Array of appointments belonging to the authenticated doctor.
403 if wrong role, 401 if missing token.

### B) Sales summary

```bash
# Today's + current month's totals (defaults to Mongolia local date)
curl -s "$BASE/api/doctor/sales-summary" \
  -H "Cookie: access_token=$TOKEN" | jq .

# Specific date
curl -s "$BASE/api/doctor/sales-summary?date=2026-03-01" \
  -H "Cookie: access_token=$TOKEN" | jq .
```

### C) Start encounter (requires appointment with status=ongoing)

```bash
# Replace 42 with a real appointmentId where doctorId matches and status=ongoing
curl -s -X POST "$BASE/api/doctor/appointments/42/encounter" \
  -H "Cookie: access_token=$TOKEN" \
  -H "Content-Type: application/json" | jq .
# → { "encounterId": 123 }

# 403 if appointment doesn't belong to doctor
# 403 if status is not 'ongoing' (e.g. booked, ready_to_pay)
```

### D) Visit card (Үзлэгийн карт)

```bash
# Read (any status)
curl -s "$BASE/api/doctor/appointments/42/visit-card" \
  -H "Cookie: access_token=$TOKEN" | jq .

# Save / update (requires ongoing)
curl -s -X PUT "$BASE/api/doctor/appointments/42/visit-card" \
  -H "Cookie: access_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"ADULT","answers":{"q1":"yes"},"signed":false}' | jq .

# Upload patient signature (requires ongoing, multipart)
curl -s -X POST "$BASE/api/doctor/appointments/42/visit-card/signature" \
  -H "Cookie: access_token=$TOKEN" \
  -F "file=@/path/to/signature.png" \
  -F "type=ADULT" | jq .

# Shared signature (requires ongoing)
curl -s -X POST "$BASE/api/doctor/appointments/42/visit-card/shared-signature" \
  -H "Cookie: access_token=$TOKEN" \
  -F "file=@/path/to/signature.png" | jq .
```

### E) Ortho card (Гажиг заслын карт)

```bash
# Read (any status)
curl -s "$BASE/api/doctor/appointments/42/ortho-card" \
  -H "Cookie: access_token=$TOKEN" | jq .

# Save / update (requires ongoing)
curl -s -X PUT "$BASE/api/doctor/appointments/42/ortho-card" \
  -H "Cookie: access_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"teeth":[],"notes":"test"}}' | jq .
```

## Authorization hardening for encounter write endpoints

`PUT/POST/DELETE /api/encounters/:id/*` now enforces:
- `admin` / `super_admin`: always allowed
- `doctor`: allowed only when
  1. `encounter.doctorId === req.user.id` (ownership)
  2. `appointment.status === 'ongoing'` (not finished)
- All other roles: `403 Forbidden`

Test doctor blocked from finished encounter:
```bash
# encounter linked to an appointment with status=ready_to_pay → expect 403
curl -s -X PUT "$BASE/api/encounters/99/prescription" \
  -H "Cookie: access_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":[]}' | jq .
# → { "error": "Encounters can only be edited while the appointment is 'ongoing'..." }
```
