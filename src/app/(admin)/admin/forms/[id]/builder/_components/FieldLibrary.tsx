"use client";

import React, { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { FieldType } from "@prisma/client";

import type { BuilderFieldConfig, LibraryItem, LibraryTab, QuickPackId } from "../builder.types";

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function DraggableRow(props: {
  item: LibraryItem;
  disabled?: boolean;
  right?: React.ReactNode;
  onAdd?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib:${props.item.id}`,
    data: { kind: "LIB", item: props.item },
    disabled: props.disabled,
  });

  const style: React.CSSProperties = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        "group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3",
        !props.disabled && "hover:bg-slate-50",
        isDragging && "opacity-60"
      )}
    >
      <button
        type="button"
        className={cx(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500",
          props.disabled ? "opacity-40" : "hover:bg-slate-100"
        )}
        title={props.disabled ? "Bereits vorhanden" : "Ziehen & Platzieren"}
        aria-label="Ziehen"
        {...attributes}
        {...listeners}
        disabled={props.disabled}
      >
        ⠿
      </button>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900 leading-5 break-words">{props.item.title}</div>
        {props.item.subtitle ? <div className="text-xs text-slate-500 leading-5 break-words">{props.item.subtitle}</div> : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {props.right}
        <button
          type="button"
          className={cx(
            "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold",
            props.disabled ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
          onClick={props.onAdd}
          disabled={props.disabled}
          title={props.disabled ? "Bereits vorhanden" : "Hinzufügen"}
        >
          + Hinzufügen
        </button>
      </div>
    </div>
  );
}

export const QUICKPACKS: Array<{ id: QuickPackId; title: string; subtitle: string }> = [
  { id: "CONTACT_MINI", title: "Kontaktblock – Kurz", subtitle: "Vorname, Nachname, Firma, E-Mail, Telefon" },
  { id: "CONTACT_FULL", title: "Kontaktblock – Erweitert", subtitle: "Vorname, Nachname, Firma, E-Mail, Adresse, PLZ, Ort, Telefon, Land, Webadresse" },
];

export const LIB_ITEMS: LibraryItem[] = [
  {
    id: "text",
    tab: "FORM",
    kind: "type",
    title: "Text",
    subtitle: "Einzeilig",
    type: ("TEXT" as FieldType),
    defaultLabel: "Text",
    keyBase: "text",
    defaultPlaceholder: "",
    defaultConfig: { section: "FORM" },
  },
  {
    id: "textarea",
    tab: "FORM",
    kind: "type",
    title: "Textbereich",
    subtitle: "Mehrzeilig",
    type: ("TEXTAREA" as FieldType),
    defaultLabel: "Text",
    keyBase: "textarea",
    defaultPlaceholder: "",
    defaultConfig: { section: "FORM" },
  },
  {
    id: "email",
    tab: "FORM",
    kind: "type",
    title: "E-Mail",
    subtitle: "Validierung + Tastatur",
    type: ("EMAIL" as FieldType),
    defaultLabel: "E-Mail",
    keyBase: "email",
    defaultPlaceholder: "name@firma.ch",
    defaultConfig: { section: "FORM" },
  },
  {
    id: "phone",
    tab: "FORM",
    kind: "type",
    title: "Telefon",
    subtitle: "Tel-Eingabe",
    type: ("PHONE" as FieldType),
    defaultLabel: "Telefon",
    keyBase: "phone",
    defaultPlaceholder: "+41 …",
    defaultConfig: { section: "FORM" },
  },
  {
    id: "checkbox",
    tab: "FORM",
    kind: "type",
    title: "Checkbox",
    subtitle: "Ja / Nein",
    type: ("CHECKBOX" as FieldType),
    defaultLabel: "Checkbox",
    keyBase: "checkbox",
    defaultConfig: { section: "FORM" },
  },
  {
    id: "single_select",
    tab: "FORM",
    kind: "type",
    title: "Einzelauswahl",
    subtitle: "Eine Auswahl",
    type: ("SINGLE_SELECT" as FieldType),
    defaultLabel: "Auswahl",
    keyBase: "select",
    defaultConfig: { section: "FORM", options: ["Option 1"] },
    defaultHelpText: "Optionen in den Einstellungen pflegen.",
  },
  {
    id: "multi_select",
    tab: "FORM",
    kind: "type",
    title: "Mehrfachauswahl",
    subtitle: "Mehrere Optionen",
    type: ("MULTI_SELECT" as FieldType),
    defaultLabel: "Auswahl",
    keyBase: "multiselect",
    defaultConfig: { section: "FORM", options: ["Option 1"] },
    defaultHelpText: "Optionen in den Einstellungen pflegen.",
  },

  {
    id: "date",
    tab: "FORM",
    kind: "type",
    title: "Datum",
    subtitle: "Date Picker",
    type: ("TEXT" as FieldType),
    defaultLabel: "Datum",
    keyBase: "date",
    defaultConfig: { section: "FORM", variant: "date" },
  },
  {
    id: "datetime",
    tab: "FORM",
    kind: "type",
    title: "Datum + Uhrzeit",
    subtitle: "DateTime Picker",
    type: ("TEXT" as FieldType),
    defaultLabel: "Datum / Uhrzeit",
    keyBase: "datetime",
    defaultConfig: { section: "FORM", variant: "datetime" },
  },
  {
    id: "rating",
    tab: "FORM",
    kind: "type",
    title: "Bewertung (1–5)",
    subtitle: "Stern-Rating",
    type: ("TEXT" as FieldType),
    defaultLabel: "Bewertung",
    keyBase: "rating",
    defaultConfig: { section: "FORM", variant: "rating", ratingMax: 5 },
  },
  {
    id: "yesno",
    tab: "FORM",
    kind: "type",
    title: "Ja / Nein",
    subtitle: "Preset",
    type: ("SINGLE_SELECT" as FieldType),
    defaultLabel: "Ja / Nein",
    keyBase: "yesNo",
    defaultConfig: { section: "FORM", variant: "yesNo", options: ["Ja", "Nein"] },
  },
  {
    id: "consent",
    tab: "FORM",
    kind: "type",
    title: "Einwilligung",
    subtitle: "Datenschutz / Marketing Opt-in",
    type: ("CHECKBOX" as FieldType),
    defaultLabel: "Ich bin einverstanden",
    keyBase: "consent",
    defaultConfig: {
      section: "FORM",
      variant: "consent",
      consentText: "Ich bin einverstanden, dass meine Daten zur Kontaktaufnahme verwendet werden.",
    },
  },
  {
    id: "attachment",
    tab: "FORM",
    kind: "type",
    title: "Dokument / Foto",
    subtitle: "Anhang zur Leaderfassung",
    type: ("TEXT" as FieldType),
    defaultLabel: "Anhang",
    keyBase: "attachment",
    defaultConfig: {
      section: "FORM",
      variant: "attachment",
      attachment: { maxFiles: 1, accept: ["image/*", "application/pdf"] },
    },
    defaultHelpText: "In der App: Datei wählen oder Foto aufnehmen.",
  },
  {
    id: "audio",
    tab: "FORM",
    kind: "type",
    title: "Audio / Sprachnotiz",
    subtitle: "Aufnehmen oder Datei wählen",
    type: ("TEXT" as FieldType),
    defaultLabel: "Sprachnotiz",
    keyBase: "audio",
    defaultConfig: {
      section: "FORM",
      variant: "audio",
      audio: { maxDurationSec: 60, allowRecord: true, allowPick: true },
    },
  },

  {
    id: "c_firstName",
    tab: "CONTACT",
    kind: "contact",
    title: "Vorname",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "firstName",
    defaultLabel: "Vorname",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_lastName",
    tab: "CONTACT",
    kind: "contact",
    title: "Nachname",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "lastName",
    defaultLabel: "Nachname",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_company",
    tab: "CONTACT",
    kind: "contact",
    title: "Firma",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "company",
    defaultLabel: "Firma",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id:"c_title",
    tab: "CONTACT",
    kind: "contact",
    title: "Funktion",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "title",
    defaultLabel: "Funktion",
    defaultPlaceholder: "z.B. Verkaufsleiter",
  },
  {
    id: "c_email",
    tab: "CONTACT",
    kind: "contact",
    title: "E-Mail",
    subtitle: "Kontakt",
    type: ("EMAIL" as FieldType),
    key: "email",
    defaultLabel: "E-Mail",
    defaultPlaceholder: "name@firma.ch",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_phone",
    tab: "CONTACT",
    kind: "contact",
    title: "Telefon",
    subtitle: "Kontakt",
    type: ("PHONE" as FieldType),
    key: "phone",
    defaultLabel: "Telefon",
    defaultPlaceholder: "+41 …",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_address",
    tab: "CONTACT",
    kind: "contact",
    title: "Adresse",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "address",
    defaultLabel: "Adresse",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_zip",
    tab: "CONTACT",
    kind: "contact",
    title: "PLZ",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "zip",
    defaultLabel: "PLZ",
    defaultPlaceholder: "8000",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_city",
    tab: "CONTACT",
    kind: "contact",
    title: "Ort",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "city",
    defaultLabel: "Ort",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_country",
    tab: "CONTACT",
    kind: "contact",
    title: "Land",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "country",
    defaultLabel: "Land",
    defaultConfig: { section: "CONTACT" },
  },
  {
    id: "c_website",
    tab: "CONTACT",
    kind: "contact",
    title: "Webadresse",
    subtitle: "Kontakt",
    type: ("TEXT" as FieldType),
    key: "website",
    defaultLabel: "Webadresse",
    defaultPlaceholder: "https://…",
    defaultConfig: { section: "CONTACT" },
  },
];

export function buildPackItems(pack: QuickPackId): string[] {
  if (pack === "CONTACT_MINI") return ["firstName", "lastName", "company", "email", "phone"];
  return ["firstName", "lastName", "company", "email", "address", "zip", "city", "phone", "country", "website"];
}

export default function FieldLibrary(props: {
  tab: LibraryTab;
  onTabChange: (t: LibraryTab) => void;

  existingKeys: Set<string>;
  onAddItem: (item: LibraryItem) => void;
  onAddPack: (pack: QuickPackId) => void;

  autoOpenSettings: boolean;
  onToggleAutoOpen: (v: boolean) => void;
}) {
  const items = useMemo(() => {
    const all = LIB_ITEMS.filter((x) => x.tab === props.tab);
    if (props.tab === "CONTACT") {
      const order = ["firstName", "lastName", "company", "email", "phone", "address", "zip", "city", "country", "website"];
      return all.slice().sort((a, b) => {
        const ak = (a as any).key ?? "";
        const bk = (b as any).key ?? "";
        return order.indexOf(ak) - order.indexOf(bk);
      });
    }
    return all;
  }, [props.tab]);

  const countForm = useMemo(() => LIB_ITEMS.filter((x) => x.tab === "FORM").length, []);
  const countContact = useMemo(() => LIB_ITEMS.filter((x) => x.tab === "CONTACT").length, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="p-4">
        <div className="text-sm font-semibold text-slate-900">Feldbibliothek</div>
        <div className="mt-1 text-xs text-slate-500">
          Per Drag&Drop ins Formular ziehen oder per Klick hinzufügen. Kontaktfelder werden per Key nicht doppelt angelegt.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={cx(
              "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-semibold",
              props.tab === "FORM" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
            onClick={() => props.onTabChange("FORM")}
          >
            Formularfelder ({countForm})
          </button>

          <button
            type="button"
            className={cx(
              "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-semibold",
              props.tab === "CONTACT"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
            onClick={() => props.onTabChange("CONTACT")}
          >
            Kontaktfelder ({countContact})
          </button>

          <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={props.autoOpenSettings}
              onChange={(e) => props.onToggleAutoOpen(e.target.checked)}
            />
            Einstellungen nach “Hinzufügen” automatisch öffnen (nur falls nötig)
          </label>
        </div>
      </div>

      <div className="h-px w-full bg-slate-200" />

      <div className="p-4 space-y-3">
        {props.tab === "CONTACT" ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700">Kontaktblock hinzufügen</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {QUICKPACKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 hover:bg-slate-50"
                  onClick={() => props.onAddPack(p.id)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                    <div className="text-xs text-slate-500">{p.subtitle}</div>
                  </div>
                  <div className="text-xs font-semibold text-slate-700">+ Einfügen</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {items.map((it) => {
          const disabled = it.kind === "contact" ? props.existingKeys.has(it.key) : false;

          return (
            <DraggableRow
              key={it.id}
              item={it}
              disabled={disabled}
              onAdd={() => props.onAddItem(it)}
              right={
                disabled ? (
                  <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                    vorhanden
                  </span>
                ) : null
              }
            />
          );
        })}
      </div>

      <div className="p-4 pt-0 text-xs text-slate-500">
        Tipp: Drag&Drop zeigt die Einfügeposition. Du kannst Felder später auch zwischen Screen 1 (Formular) und Screen 2 (Kontakt) verschieben.
      </div>
    </section>
  );
}
