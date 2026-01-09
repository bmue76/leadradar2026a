/**
 * LeadRadar2026A — QR Code helper
 * - centralizes qrcode usage
 * - avoids `any` in client components
 */

import type { QRCodeToDataURLOptions } from "qrcode";

type QrModuleShape = {
  toDataURL?: (text: string, options?: QRCodeToDataURLOptions) => Promise<string>;
  default?: {
    toDataURL?: (text: string, options?: QRCodeToDataURLOptions) => Promise<string>;
  };
};

export async function qrToDataUrl(text: string, options?: QRCodeToDataURLOptions): Promise<string> {
  const modUnknown = (await import("qrcode")) as unknown;
  const mod = modUnknown as QrModuleShape;

  const toDataURL = mod.toDataURL ?? mod.default?.toDataURL;

  if (typeof toDataURL !== "function") {
    throw new Error("qrcode.toDataURL is not available.");
  }

  return toDataURL(text, options);
}
