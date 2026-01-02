"use client";

import ReorderControls from "./ReorderControls";
import type { FormField } from "./formDetail.types";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-xs text-gray-700">
      {children}
    </span>
  );
}

export default function FieldsTable(props: {
  fields: FormField[];
  order: string[];
  onMoveUp: (fieldId: string) => void;
  onMoveDown: (fieldId: string) => void;
  onEdit: (field: FormField) => void;
  onDelete: (field: FormField) => void;
  reorderDisabled?: boolean;
}) {
  const { fields, order, onMoveUp, onMoveDown, onEdit, onDelete, reorderDisabled } = props;

  const byId = new Map(fields.map((f) => [f.id, f]));
  const rows: FormField[] = order.map((id) => byId.get(id)).filter(Boolean) as FormField[];

  return (
    <div className="overflow-hidden rounded-2xl border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-600">
              <th className="w-24 border-b px-4 py-3">Order</th>
              <th className="border-b px-4 py-3">Label</th>
              <th className="border-b px-4 py-3">Key</th>
              <th className="border-b px-4 py-3">Type</th>
              <th className="border-b px-4 py-3">Flags</th>
              <th className="w-44 border-b px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, idx) => (
              <tr key={f.id} className="text-sm">
                <td className="border-b px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ReorderControls
                      index={idx}
                      count={rows.length}
                      onMoveUp={() => onMoveUp(f.id)}
                      onMoveDown={() => onMoveDown(f.id)}
                      disabled={reorderDisabled}
                    />
                    <div className="text-xs text-gray-500">#{idx + 1}</div>
                  </div>
                </td>

                <td className="border-b px-4 py-3">
                  <div className="font-medium text-gray-900">{f.label}</div>
                  {(f.placeholder || f.helpText) && (
                    <div className="mt-1 text-xs text-gray-500">
                      {f.placeholder ? `Placeholder: ${f.placeholder}` : null}
                      {f.placeholder && f.helpText ? " · " : null}
                      {f.helpText ? `Help: ${f.helpText}` : null}
                    </div>
                  )}
                </td>

                <td className="border-b px-4 py-3">
                  <div className="font-mono text-xs text-gray-800">{f.key}</div>
                </td>

                <td className="border-b px-4 py-3">
                  <Badge>{f.type}</Badge>
                </td>

                <td className="border-b px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {f.required ? <Badge>Required</Badge> : <Badge>Optional</Badge>}
                    {f.isActive ? <Badge>Active</Badge> : <Badge>Inactive</Badge>}
                  </div>
                </td>

                <td className="border-b px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-xs hover:bg-gray-50"
                      onClick={() => onEdit(f)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
                      onClick={() => onDelete(f)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                  No fields.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
