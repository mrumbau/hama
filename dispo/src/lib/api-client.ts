/** Fetch-Wrapper: wirft bei Fehlern mit der Servermeldung. */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error((data && data.error) || `Fehler ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, body: unknown) =>
    apiFetch<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) =>
    apiFetch<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(url: string) => apiFetch<T>(url, { method: 'DELETE' }),
};
