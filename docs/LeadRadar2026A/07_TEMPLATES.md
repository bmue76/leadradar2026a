# Templates (Vorlagen) — Tenant vs System

## Datenmodell (MVP)

Wir verwenden `FormPreset` als Vorlagen-Backbone.

- **Tenant-Vorlagen (EDIT/DELETE)**  
  `tenantId = <tenant>` und `isPublic = false`

- **System-Vorlagen (READ-only)**  
  `tenantId = null` und `isPublic = true`

Die Admin-UI listet beides unter `/admin/templates` (Filter: Quelle).

## System-Vorlagen erzeugen (Seed)

System-Vorlagen werden als Kopien aus bestehenden Tenant-Vorlagen erzeugt (idempotent).

### 1) Tenant-Vorlagen einmalig anlegen
Im Builder eines Formulars: **„Als Vorlage speichern“**  
Empfohlene Namen (Default im Script):
- Messekontakt Standard
- Produkt-Lead
- Terminvereinbarung

### 2) Promote/Seed Script ausführen

```bash
node scripts/seed-system-templates.mjs
Optional:

SYSTEM_TEMPLATE_NAMES="A,B,C"

SEED_SOURCE_TENANT_ID="<tenantId>"

Das Script erzeugt/aktualisiert die SYSTEM-Kopie (tenantId=null, isPublic=true) und lässt die Tenant-Vorlage unverändert.
