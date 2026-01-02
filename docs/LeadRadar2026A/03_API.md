# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-01-02  
Prinzipien: tenant-scoped, leak-safe (falscher Tenant/ID => 404), Standard Responses + traceId.

---

## Standard Responses

### Success
```json
{ "ok": true, "data": { ... }, "traceId": "..." }
