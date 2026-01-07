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

type Props = {
  fields: FormField[];
  selectedId: string;
  onSelect: (id: string) => void;

  onAdd: () => void;

  orderDirty: boolean;
  orderBusy: boolean;
  onSaveOrder: () => void;
  onReorder: (nextOrderIds: string[]) => void;

  draft: FieldDraft | null;
  onDraftPatch: (patch: Partial<FieldDraft>) => void;

  saving: boolean;
  saveErr: string | null;
  saveTraceId: string | null;
  onSaveSelected: () => void;
};

export default function FormWorkspace(props: Props) {
  const selected = React.useMemo(
    () => props.fields.find((f) => f.id === props.selectedId) || null,
    [props.fields, props.selectedId]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
      {/* Left: Fields */}
      <FieldsList
        fields={props.fields}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
        onAdd={props.onAdd}
        orderDirty={props.orderDirty}
        orderBusy={props.orderBusy}
        onSaveOrder={props.onSaveOrder}
        onReorder={props.onReorder}
      />

      {/* Middle: Preview */}
      <PreviewPane fields={props.fields} />

      {/* Right: Properties */}
      <InspectorPane
        selected={selected}
        draft={props.draft}
        onDraftPatch={props.onDraftPatch}
        saving={props.saving}
        saveErr={props.saveErr}
        saveTraceId={props.saveTraceId}
        onSave={props.onSaveSelected}
      />
    </div>
  );
}
