import * as React from "react";

export default function IPhonePreviewFrame(props: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[390px] max-w-full">
      <div className="rounded-[34px] border border-slate-200 bg-white p-3">
        <div className="rounded-[28px] border border-slate-200 bg-slate-50">
          <div className="h-[720px] overflow-y-auto rounded-[28px] bg-white">
            {props.children}
          </div>
        </div>
      </div>
      <div className="mt-2 text-center text-xs text-slate-500">Preview (read-only)</div>
    </div>
  );
}