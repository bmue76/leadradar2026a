export type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "EMAIL"
  | "PHONE"
  | "CHECKBOX";

export type BuilderStep = "build" | "design" | "publish";

export type BuilderSaveState = "saved" | "dirty" | "saving" | "error";

export type ToastState =
  | null
  | {
      message: string;
      actionLabel?: string;
      actionId?: "undoDelete";
    };

export type FieldDraft = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  isActive: boolean;
  placeholder: string;
  helpText: string;
  optionsText: string;
  checkboxDefault: boolean;
};

export type FieldTypeInfo = {
  type: FieldType;
  label: string;
  hint: string;
};

export const FIELD_TYPES: FieldTypeInfo[] = [
  { type: "TEXT", label: "Text", hint: "Single line input" },
  { type: "TEXTAREA", label: "Textarea", hint: "Multi-line input" },
  { type: "EMAIL", label: "Email", hint: "Validated email" },
  { type: "PHONE", label: "Phone", hint: "Phone number" },
  { type: "SINGLE_SELECT", label: "Select (single)", hint: "One option" },
  { type: "MULTI_SELECT", label: "Select (multi)", hint: "Multiple options" },
  { type: "CHECKBOX", label: "Checkbox", hint: "Yes / No" },
];

export function fieldTypeLabel(t: FieldType): string {
  switch (t) {
    case "TEXT":
      return "Text";
    case "TEXTAREA":
      return "Textarea";
    case "EMAIL":
      return "Email";
    case "PHONE":
      return "Phone";
    case "SINGLE_SELECT":
      return "Select (single)";
    case "MULTI_SELECT":
      return "Select (multi)";
    case "CHECKBOX":
      return "Checkbox";
    default:
      return String(t);
  }
}
