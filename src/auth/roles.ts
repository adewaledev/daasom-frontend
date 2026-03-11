export type UserRole = "ADMIN" | "OPS" | "ACCOUNTS" | "VIEWER"

export type Permission =
  | "clients.write"
  | "jobs.write"
  | "tracker.write"
  | "expenses.write"
  | "invoices.write"
  | "receipts.write"
  | "documents.write"

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  OPS: "Operations",
  ACCOUNTS: "Accounts",
  VIEWER: "Viewer",
}

const PERMISSIONS_BY_ROLE: Record<UserRole, Permission[]> = {
  ADMIN: [
    "clients.write",
    "jobs.write",
    "tracker.write",
    "expenses.write",
    "invoices.write",
    "receipts.write",
    "documents.write",
  ],
  OPS: ["clients.write", "jobs.write", "tracker.write", "expenses.write", "invoices.write", "documents.write"],
  ACCOUNTS: ["invoices.write", "receipts.write", "documents.write"],
  VIEWER: [],
}

export function isUserRole(value: unknown): value is UserRole {
  return value === "ADMIN" || value === "OPS" || value === "ACCOUNTS" || value === "VIEWER"
}

export function getRoleLabel(role: UserRole | null | undefined): string {
  if (!role) return "Unknown"
  return ROLE_LABELS[role]
}

export function canRole(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return PERMISSIONS_BY_ROLE[role].includes(permission)
}