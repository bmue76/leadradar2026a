import * as SecureStore from "expo-secure-store";

const KEY_ACTIVE_EVENT_ID = "lr_active_event_id";
const KEY_LAST_EVENT_ID = "lr_last_active_event_id";

export async function getActiveEventId(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY_ACTIVE_EVENT_ID);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function getLastActiveEventId(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY_LAST_EVENT_ID);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function setActiveEventId(eventId: string): Promise<void> {
  const v = (eventId || "").trim();
  if (!v) return;
  try {
    await SecureStore.setItemAsync(KEY_ACTIVE_EVENT_ID, v);
    await SecureStore.setItemAsync(KEY_LAST_EVENT_ID, v);
  } catch {
    // ignore (best-effort)
  }
}

export async function clearActiveEventId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ACTIVE_EVENT_ID);
  } catch {
    // ignore
  }
}
