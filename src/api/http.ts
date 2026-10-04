export const BASE_URL = "https://api.camptocamp.org";

export interface JsonRequest {
  path: string; // starts with "/", e.g. "/routes/123"
  params?: URLSearchParams;
}

// The only place that calls the Camptocamp API: every endpoint goes through here.
export async function getJson<T>({ path, params }: JsonRequest): Promise<T> {
  const query = params?.toString();
  const response = await fetch(query ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Camptocamp API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}
