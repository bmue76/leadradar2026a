"use client";

import type { FormDetail, FormField, FormStatus } from "../formDetail.types";
import type { BuilderSaveState, FieldDraft as BuilderFieldDraft, FieldType } from "../_lib/builderV2.types";

import BuilderV2 from "./builderV2/BuilderV2";

/**
 * Legacy type export expected by older workspace components (e.g. InspectorPane).
 * Keep it to avoid TypeScript breaks while migrating.
 */
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
  form: FormDetail;
  fields: FormField[];

  selectedId: string;
  onSelect: (id: string) => void;

  showInactive: boolean;
  onToggleShowInactive: (v: boolean) => void;

  draft: BuilderFieldDraft | null;
  onDraftPatch: (patch: Partial<BuilderFieldDraft>) => void;

  saveState: BuilderSaveState;
  saveErr: string | null;
  saveTraceId: string | null;

  onAddField: (input?: {
    label?: string;
    type?: FieldType;
    required?: boolean;
    isActive?: boolean;
    placeholder?: string;
    helpText?: string;
    config?: unknown;
    keyHint?: string;
  }) => void;

  onDuplicateField: (id: string) => void;
  onDeleteField: (id: string) => void;

  onPatchFieldFlags: (id: string, patch: { required?: boolean; isActive?: boolean }) => void;

  onReorderVisible: (nextVisibleOrderIds: string[], visibleIds: string[]) => void;

  statusBusy: boolean;
  onSetStatus: (s: FormStatus) => void;
};

export default function FormWorkspace(props: Props) {
  return <BuilderV2 {...props} />;
}
