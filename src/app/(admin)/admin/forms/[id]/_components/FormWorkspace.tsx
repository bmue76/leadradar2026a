"use client";

import * as React from "react";
import type { FormField } from "../formDetail.types";

import FieldsList from "./workspace/FieldsList";
import PreviewPane from "./workspace/PreviewPane";
import InspectorPane from "./workspace/InspectorPane";

export type FieldDraft = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isActive: boolean;
  placeholder: string;
  helpText: string;
  optionsText: string;
  checkboxDefault: boolean;
};

export default function FormWorkspace(props: {
  fields: FormField[];
  selectedId: string;
  onSelect: (id: string) => void;

  onAdd: () => void;

  orderDirty: boolean;
  orderBusy: boolean;
  onMoveUp: (fieldId: string) => void;
  onMoveDown: (fieldId: string) => void;
  onSaveOrder: () => void;

  saving: boolean;
  saveErr: string | null;
  saveTraceId: string | null;

  draft: FieldDraft | null;
  onDraftPatch: (patch: Partial<FieldDraft>) => void;
  onSave: () => void;
}) {
  const selected = React.useMemo(
    () => props.fields.find((f) => f.id === props.selectedId) || null,
    [props.fields, props.selectedId]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
      <FieldsList
        fields={props.fields}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
        onAdd={props.onAdd}
        orderDirty={props.orderDirty}
        orderBusy={props.orderBusy}
        onMoveUp={props.onMoveUp}
        onMoveDown={props.onMoveDown}
        onSaveOrder={props.onSaveOrder}
      />

      <PreviewPane fields={props.fields.filter((f) => Boolean(f.isActive))} />

      <InspectorPane
        selected={selected}
        draft={props.draft}
        onDraftPatch={props.onDraftPatch}
        saving={props.saving}
        saveErr={props.saveErr}
        saveTraceId={props.saveTraceId}
        onSave={props.onSave}
      />
    </div>
  );
}
