/**
 * Phase 1 (ONLINE-only): Offline wird NICHT implementiert.
 * Wir legen nur Interfaces/Platzhalter an, damit Phase 2 sauber vorbereitet ist.
 */

export type PendingLead = {
  id: string;
  payload: unknown;
  createdAt: string; // ISO
};

/**
 * Placeholder: would enqueue a lead payload locally for later sync.
 * Phase 2: persist in SQLite/MMKV and flush when online.
 */
export async function enqueueLead(payload: unknown): Promise<void> {
  // not implemented (Phase 1)
  void payload;
}

/**
 * Placeholder: would flush queued leads to backend.
 */
export async function flushQueue(): Promise<void> {
  // not implemented (Phase 1)
}
