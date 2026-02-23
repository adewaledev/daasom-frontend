import http from "./http"

export interface Client {
  id: number
  client_code: string
  client_prefix: string
  client_name: string
  email?: string
  phone?: string
  address?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

function isPaginated<T>(data: any): data is Paginated<T> {
  return data && typeof data === "object" && Array.isArray(data.results)
}

/**
 * Only include optional text fields if non-empty strings.
 * Required fields must be present.
 */
function cleanClientPayload(payload: Partial<Client>): Record<string, any> {
  const out: Record<string, any> = {}

  if (payload.client_code !== undefined) out.client_code = String(payload.client_code).trim()
  if (payload.client_prefix !== undefined) out.client_prefix = String(payload.client_prefix).trim()
  if (payload.client_name !== undefined) out.client_name = String(payload.client_name).trim()

  if (payload.email !== undefined) {
    const v = String(payload.email).trim()
    if (v) out.email = v
  }

  if (payload.phone !== undefined) {
    const v = String(payload.phone).trim()
    if (v) out.phone = v
  }

  if (payload.address !== undefined) {
    const v = String(payload.address).trim()
    if (v) out.address = v
  }

  if (payload.is_active !== undefined) out.is_active = !!payload.is_active

  return out
}

export async function listClients(): Promise<Client[]> {
  const res = await http.get("/clients/")
  const data = res.data
  if (isPaginated<Client>(data)) return data.results
  return data as Client[]
}

export async function createClient(payload: Partial<Client>): Promise<Client> {
  const res = await http.post("/clients/", cleanClientPayload(payload))
  return res.data
}

export async function updateClient(id: number, payload: Partial<Client>): Promise<Client> {
  const res = await http.patch(`/clients/${id}/`, cleanClientPayload(payload))
  return res.data
}