/* eslint-disable react-hooks/refs */
"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import type { LibraryItem, LibraryTab } from "../builder.types";

function TabButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "h-9 rounded-lg px-3 text-sm font-semibold",
        props.active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

function ActionButton(props: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
    >
      {props.children}
    </button>
  );
}

function DraggableItem(props: { item: LibraryItem; onQuickAdd: (it: LibraryItem) => void }) {
  const id = `lib:${props.item.id}`;

  const d = useDraggable({
    id,
    data: { kind: "library", item: props.item },
  });

  return (
    <button
      type="button"
      ref={d.setNodeRef}
      {...d.listeners}
      {...d.attributes}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50 active:bg-slate-100"
      onClick={() => props.onQuickAdd(props.item)}
      title="Drag onto canvas or click to add"
    >
      <div className="text-sm font-semibold">{props.item.title}</div>
      {props.item.subtitle ? <div className="mt-0.5 text-xs text-slate-500">{props.item.subtitle}</div> : null}
    </button>
  );
}

export const LIB_ITEMS: LibraryItem[] = [
  // ---- Form fields tab
  { id: "text", tab: "fields", kind: "type", type: "TEXT", title: "Text", subtitle: "Single line", defaultLabel: "Text", keyBase: "text", defaultPlaceholder: "" },
  { id: "textarea", tab: "fields", kind: "type", type: "TEXTAREA", title: "Textarea", subtitle: "Multi line", defaultLabel: "Notes", keyBase: "notes", defaultPlaceholder: "Notes / context" },
  { id: "email", tab: "fields", kind: "type", type: "EMAIL", title: "Email", subtitle: "Validation + keyboard", defaultLabel: "Email", keyBase: "email2", defaultPlaceholder: "name@company.com" },
  { id: "phone", tab: "fields", kind: "type", type: "PHONE", title: "Phone", subtitle: "Tel input", defaultLabel: "Phone", keyBase: "phone2", defaultPlaceholder: "+41 ..." },
  { id: "checkbox", tab: "fields", kind: "type", type: "CHECKBOX", title: "Checkbox", subtitle: "True / False", defaultLabel: "Checkbox", keyBase: "checkbox" },

  { id: "single_select", tab: "fields", kind: "type", type: "SINGLE_SELECT", title: "Single Select", subtitle: "Choose one", defaultLabel: "Select", keyBase: "select", defaultConfig: { options: ["Option 1"] } },
  { id: "multi_select", tab: "fields", kind: "type", type: "MULTI_SELECT", title: "Multi Select", subtitle: "Choose many", defaultLabel: "Multi Select", keyBase: "multiselect", defaultConfig: { options: ["Option 1"] } },

  // Rating preset (no new FieldType; mapped to SINGLE_SELECT options)
  {
    id: "rating_1_5",
    tab: "fields",
    kind: "preset",
    type: "SINGLE_SELECT",
    title: "Rating (1–5)",
    subtitle: "Preset: 1..5",
    defaultLabel: "Rating",
    keyBase: "rating",
    defaultConfig: { options: ["1", "2", "3", "4", "5"] },
    defaultHelpText: "Preset rating (Phase 1: stored as single select).",
  },

  // useful presets
  {
    id: "yes_no",
    tab: "fields",
    kind: "preset",
    type: "SINGLE_SELECT",
    title: "Yes / No",
    subtitle: "Preset: yes, no",
    defaultLabel: "Yes / No",
    keyBase: "yesNo",
    defaultConfig: { options: ["Yes", "No"] },
  },
  {
    id: "consent",
    tab: "fields",
    kind: "preset",
    type: "CHECKBOX",
    title: "Consent",
    subtitle: "GDPR / marketing opt-in",
    defaultLabel: "Consent",
    keyBase: "consent",
    defaultConfig: null,
    defaultHelpText: "I agree to be contacted.",
  },

  // ---- Contact fields tab
  { id: "c_firstName", tab: "contacts", kind: "contact", type: "TEXT", title: "First name", defaultLabel: "First name", key: "firstName", defaultPlaceholder: "First name" },
  { id: "c_lastName", tab: "contacts", kind: "contact", type: "TEXT", title: "Last name", defaultLabel: "Last name", key: "lastName", defaultPlaceholder: "Last name" },
  { id: "c_company", tab: "contacts", kind: "contact", type: "TEXT", title: "Company", defaultLabel: "Company", key: "company", defaultPlaceholder: "Company" },
  { id: "c_email", tab: "contacts", kind: "contact", type: "EMAIL", title: "E-mail", defaultLabel: "E-mail", key: "email", defaultPlaceholder: "name@company.com" },
  { id: "c_phone", tab: "contacts", kind: "contact", type: "PHONE", title: "Phone", defaultLabel: "Phone", key: "phone", defaultPlaceholder: "+41 ..." },
  { id: "c_jobTitle", tab: "contacts", kind: "contact", type: "TEXT", title: "Job title", defaultLabel: "Job title", key: "jobTitle", defaultPlaceholder: "Role / function" },
  { id: "c_street", tab: "contacts", kind: "contact", type: "TEXT", title: "Street", defaultLabel: "Street", key: "street", defaultPlaceholder: "Street / no." },
  { id: "c_zip", tab: "contacts", kind: "contact", type: "TEXT", title: "ZIP", defaultLabel: "ZIP", key: "zip", defaultPlaceholder: "ZIP" },
  { id: "c_city", tab: "contacts", kind: "contact", type: "TEXT", title: "City", defaultLabel: "City", key: "city", defaultPlaceholder: "City" },
  { id: "c_country", tab: "contacts", kind: "contact", type: "TEXT", title: "Country", defaultLabel: "Country", key: "country", defaultPlaceholder: "Country" },
  { id: "c_website", tab: "contacts", kind: "contact", type: "TEXT", title: "Website", defaultLabel: "Website", key: "website", defaultPlaceholder: "https://..." },
];

const CONTACT_ESSENTIAL_KEYS = ["firstName", "lastName", "company", "email", "phone"] as const;
const CONTACT_FULL_KEYS = ["firstName", "lastName", "company", "email", "phone", "jobTitle", "street", "zip", "city", "country"] as const;

function pickContactItems(all: LibraryItem[], keys: readonly string[]): LibraryItem[] {
  const map = new Map<string, LibraryItem>();
  for (const it of all) {
    if (it.kind === "contact") map.set(it.key, it);
  }
  const out: LibraryItem[] = [];
  for (const k of keys) {
    const hit = map.get(k);
    if (hit) out.push(hit);
  }
  return out;
}

function summarize(items: LibraryItem[]): string {
  // show titles in the defined order
  return items.map((x) => x.title).join(" · ");
}

export default function FieldLibrary(props: {
  items: LibraryItem[];
  onQuickAdd: (it: LibraryItem) => void;
  onQuickAddMany?: (items: LibraryItem[]) => void;
}) {
  const [tab, setTab] = React.useState<LibraryTab>("fields");
  const visible = props.items.filter((x) => x.tab === tab);

  const essentials = React.useMemo(() => pickContactItems(props.items, CONTACT_ESSENTIAL_KEYS), [props.items]);
  const fullBlock = React.useMemo(() => pickContactItems(props.items, CONTACT_FULL_KEYS), [props.items]);

  const canBatch = typeof props.onQuickAddMany === "function";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold">Field library</div>
        <div className="flex gap-2">
          <TabButton active={tab === "fields"} onClick={() => setTab("fields")}>
            Form fields
          </TabButton>
          <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")}>
            Contact fields
          </TabButton>
        </div>
      </div>

      {tab === "contacts" ? (
        <div className="mt-3 flex flex-col gap-2">
          <ActionButton
            onClick={() => props.onQuickAddMany?.(essentials)}
            title="Adds the essential contact block (skips fields that already exist)"
          >
            ➕ Add contact essentials ({essentials.length})
          </ActionButton>
          <div className="px-1 text-xs text-slate-500">Includes: {summarize(essentials)}</div>

          <ActionButton
            onClick={() => props.onQuickAddMany?.(fullBlock)}
            title="Adds the full contact block (skips fields that already exist)"
          >
            ➕ Add full contact block ({fullBlock.length})
          </ActionButton>
          <div className="px-1 text-xs text-slate-500">Includes: {summarize(fullBlock)}</div>

          {!canBatch ? <div className="text-xs text-slate-500">Batch add is not available.</div> : null}

          <div className="h-px w-full bg-slate-100" />
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {visible.map((it) => (
          <DraggableItem key={it.id} item={it} onQuickAdd={props.onQuickAdd} />
        ))}
      </div>

      <div className="mt-3 text-xs text-slate-500">Tip: drag onto the canvas or click to add. Contact fields are de-duped by key.</div>
    </div>
  );
}
