import http from "../api/http"

export type LoginResponse = {
  access: string
  refresh?: string
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  // With correct baseURL this becomes:
  // https://daasom-backend.onrender.com/api/auth/login/
  const res = await http.post("/auth/login/", { username, password })
  return res.data
}