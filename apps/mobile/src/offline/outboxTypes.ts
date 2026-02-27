/**
 * Phase 2 Prep (NO implementation in TP 9.1)
 * Offline Outbox / Sync contracts (types only).
 */

export type OutboxItemKind =
  | "LEAD_CREATE"
  | "LEAD_PATCH_CONTACT"
  | "ATTACHMENT_UPLOAD"
  | "ATTACHMENT_OCR_STORE";

export type OutboxItemBase = {
  id: string; // client-generated uuid
  kind: OutboxItemKind;
  createdAt: string; // ISO
  attempts: number;
  lastError?: { message: string; code?: string; traceId?: string; at: string };
};

export type OutboxLeadCreateItem = OutboxItemBase & {
  kind: "LEAD_CREATE";
  payload: Record<string, unknown>;
};

export type OutboxItem = OutboxLeadCreateItem;

export type OutboxEnqueueResult = { accepted: true; id: string };

export interface OutboxStore {
  enqueue(item: OutboxItem): Promise<OutboxEnqueueResult>;
  peek(limit: number): Promise<OutboxItem[]>;
  markDone(id: string): Promise<void>;
  markFailed(id: string, err: { message: string; code?: string; traceId?: string }): Promise<void>;
}
