// Small JSON POST helper for the first-party auth endpoints (OTP + invite).
export async function postJson<T = Record<string, unknown>>(
  path: string,
  body: unknown
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response
    .json()
    .catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }
  return data;
}
