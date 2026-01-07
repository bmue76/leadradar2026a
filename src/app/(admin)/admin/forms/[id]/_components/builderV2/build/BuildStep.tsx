"use client";

import * as React from "react";

import type { FormField } from "../../../formDetail.types";
import type { FieldType } from "../../../_lib/builderV2.types";

import FieldCanvas from "./FieldCanvas";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type AddFieldInput = {
  label?: string;
  type?: FieldType;
  required?: boolean;
  isActive?: boolean;
  placeholder?: string;
  helpText?: string;
  config?: unknown;
  keyHint?: string;
};

type Props = {
  fields: FormField[];
  selectedId: string;
  onSelect: (id: string) => void;

  showInactive: boolean;
  onToggleShowInactive: (v: boolean) => void;

  disabled?: boolean;

  onAddField: (input?: AddFieldInput) => void;
  onDuplicateField: (id: string) => void;
  onDeleteField: (id: string) => void;

  onPatchFieldFlags: (id: string, patch: { required?: boolean; isActive?: boolean }) => void;

  onReorderVisible: (nextVisibleOrderIds: string[], visibleIds: string[]) => void;

  // allow extra props during refactors without TS breakage
  [key: string]: unknown;
};

export default function BuildStep(props: Props) {
  const disabled = Boolean(props.disabled);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Build</div>
            <div className="mt-1 text-xs text-gray-500">Reorder, activate and configure fields.</div>
          </div>

          <label className={clsx("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-700", disabled && "opacity-60")}>
            <input
              type="checkbox"
              checked={props.showInactive}
              onChange={(e) => props.onToggleShowInactive(e.target.checked)}
              disabled={disabled}
            />
            Show inactive
          </label>
        </div>
      </div>

      <FieldCanvas
        fields={props.fields}
        selectedId={props.selectedId}
        showInactive={props.showInactive}
        disabled={disabled}
        onSelect={props.onSelect}
        onReorderVisible={props.onReorderVisible}
        onAddField={(input) => props.onAddField(input)}
        onDuplicateField={props.onDuplicateField}
        onDeleteField={props.onDeleteField}
        onPatchFieldFlags={props.onPatchFieldFlags}
      />
    </div>
  );
}
