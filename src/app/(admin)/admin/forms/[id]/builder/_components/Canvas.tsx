"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";

import CanvasSection from "./CanvasSection";
import type { BuilderField, FieldSection } from "../builder.types";

export type DropIndicator = null | { section: FieldSection; index: number };

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function sectionOfField(f: BuilderField): FieldSection {
  return (f.config?.section ?? "FORM") as FieldSection;
}

function CollapsedSection(props: {
  title: string;
  subtitle: string;
  count: number;
  droppableId: string;
  readOnly: boolean;
  isActive: boolean;
  onActivate: () => void;
  showDropHint: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: props.droppableId,
    disabled: props.readOnly,
  });

  return (
    <section
      ref={setNodeRef}
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-4",
        isOver && !props.readOnly && "bg-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {props.title} <span className="text-slate-300">—</span>{" "}
            <span className="text-slate-500">{props.count} Felder</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{props.subtitle}</div>
          {props.showDropHint ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
              Hierhin ziehen, um am Ende einzufügen
            </div>
          ) : null}
        </div>

        {!props.readOnly ? (
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={props.onActivate}
          >
            Anzeigen
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function Canvas(props: {
  fields: BuilderField[];

  dropIndicator: DropIndicator;
  draggingKind: null | "LIB" | "FIELD";

  onOpenField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onDeleteField: (id: string) => void;

  readOnly: boolean;

  activeSection: FieldSection | "ALL";
  onSwitchSection?: (s: FieldSection) => void;
}) {
  const formFields = props.fields.filter((f) => sectionOfField(f) === "FORM");
  const contactFields = props.fields.filter((f) => sectionOfField(f) === "CONTACT");

  const dropForm =
    props.draggingKind === "LIB" && props.dropIndicator && props.dropIndicator.section === "FORM"
      ? props.dropIndicator.index
      : null;

  const dropContact =
    props.draggingKind === "LIB" && props.dropIndicator && props.dropIndicator.section === "CONTACT"
      ? props.dropIndicator.index
      : null;

  if (props.activeSection === "ALL") {
    return (
      <div className="space-y-4">
        <CanvasSection
          title="Screen 1 — Formular"
          subtitle="Diese Felder werden in der App manuell ausgefüllt (dein eigentlicher Messe-Fragebogen)."
          section="FORM"
          droppableId="canvas:FORM"
          fields={formFields}
          readOnly={props.readOnly}
          dropIndex={dropForm}
          onOpenField={props.onOpenField}
          onDuplicateField={props.onDuplicateField}
          onDeleteField={props.onDeleteField}
        />
        <CanvasSection
          title="Screen 2 — Kontakt"
          subtitle="Kontaktfelder werden in der App primär via Visitenkarte/QR/Kontakte vorbefüllt (optional manuell ergänzbar)."
          section="CONTACT"
          droppableId="canvas:CONTACT"
          fields={contactFields}
          readOnly={props.readOnly}
          dropIndex={dropContact}
          onOpenField={props.onOpenField}
          onDuplicateField={props.onDuplicateField}
          onDeleteField={props.onDeleteField}
        />
      </div>
    );
  }

  const active = props.activeSection;
  const inactive: FieldSection = active === "FORM" ? "CONTACT" : "FORM";

  const activeTitle = active === "FORM" ? "Screen 1 — Formular" : "Screen 2 — Kontakt";
  const activeSubtitle =
    active === "FORM"
      ? "Diese Felder werden in der App manuell ausgefüllt (dein eigentlicher Messe-Fragebogen)."
      : "Kontaktfelder werden in der App primär via Visitenkarte/QR/Kontakte vorbefüllt (optional manuell ergänzbar).";

  const inactiveTitle = inactive === "FORM" ? "Screen 1 — Formular" : "Screen 2 — Kontakt";
  const inactiveSubtitle =
    inactive === "FORM"
      ? "Diese Felder werden in der App manuell ausgefüllt."
      : "Kontaktfelder werden in der App primär vorbefüllt.";

  const activeFields = active === "FORM" ? formFields : contactFields;
  const inactiveFields = inactive === "FORM" ? formFields : contactFields;

  const activeDrop = active === "FORM" ? dropForm : dropContact;
  const inactiveDrop = inactive === "FORM" ? dropForm : dropContact;

  return (
    <div className="space-y-4">
      <CanvasSection
        title={activeTitle}
        subtitle={activeSubtitle}
        section={active}
        droppableId={active === "FORM" ? "canvas:FORM" : "canvas:CONTACT"}
        fields={activeFields}
        readOnly={props.readOnly}
        dropIndex={activeDrop}
        onOpenField={props.onOpenField}
        onDuplicateField={props.onDuplicateField}
        onDeleteField={props.onDeleteField}
      />

      <CollapsedSection
        title={inactiveTitle}
        subtitle={inactiveSubtitle}
        count={inactiveFields.length}
        droppableId={inactive === "FORM" ? "canvas:FORM" : "canvas:CONTACT"}
        readOnly={props.readOnly}
        isActive={false}
        onActivate={() => props.onSwitchSection?.(inactive)}
        showDropHint={typeof inactiveDrop === "number"}
      />

      {!props.readOnly ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => props.onSwitchSection?.(inactive)}
          >
            {inactive === "CONTACT" ? "Zu Kontaktfeldern →" : "← Zu Formularfeldern"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
