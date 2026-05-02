// Helpers for the Web Push subscription lifecycle (registration, opt-in, opt-out).
// All routes are credentialed since auth is session-based.

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getServiceWorker();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function fetchVapidPublicKey(): Promise<{ publicKey: string | null; enabled: boolean }> {
  try {
    const r = await fetch(`${API_BASE}/notifications/vapid-public-key`, { credentials: "include" });
    if (!r.ok) return { publicKey: null, enabled: false };
    return r.json();
  } catch {
    return { publicKey: null, enabled: false };
  }
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "Tu navegador no soporta notificaciones push" };
  const reg = await getServiceWorker();
  if (!reg) return { ok: false, reason: "Service worker no disponible" };

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Permiso denegado" };

  const { publicKey, enabled } = await fetchVapidPublicKey();
  if (!enabled || !publicKey) return { ok: false, reason: "Push no está configurado en el servidor" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyBytes = urlBase64ToUint8Array(publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // The DOM type wants ArrayBuffer; we hand it the underlying buffer slice.
      applicationServerKey: keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength,
      ) as ArrayBuffer,
    });
  }

  const res = await fetch(`${API_BASE}/notifications/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  });
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return true;
  try {
    await fetch(`${API_BASE}/notifications/unsubscribe`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {}
  try {
    await sub.unsubscribe();
  } catch {}
  return true;
}
