"use client";

export default function ReorderControls(props: {
  index: number;
  count: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disabled?: boolean;
}) {
  const { index, count, onMoveUp, onMoveDown, disabled } = props;
  const isFirst = index <= 0;
  const isLast = index >= count - 1;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white text-sm hover:bg-gray-50 disabled:opacity-40"
        onClick={onMoveUp}
        disabled={disabled || isFirst}
        aria-label="Move up"
        title="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white text-sm hover:bg-gray-50 disabled:opacity-40"
        onClick={onMoveDown}
        disabled={disabled || isLast}
        aria-label="Move down"
        title="Move down"
      >
        ↓
      </button>
    </div>
  );
}
