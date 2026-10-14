// Pure decision logic for promoting/demoting admins, kept DB-free so it can
// be unit tested (same pattern as access.ts). The server action fetches the
// facts and defers to this.

export type RoleChangeFacts = {
  actorId: string;
  targetId: string;
  targetRole: string;
  targetBlocked: boolean;
  nextRole: "ADMIN" | "USER";
  // Unblocked ADMIN accounts OTHER than the target.
  otherActiveAdmins: number;
};

// Returns an error message, or null when the change is allowed.
export function evaluateRoleChange(facts: RoleChangeFacts): string | null {
  if (facts.actorId === facts.targetId) return "You can't change your own role.";
  if (facts.targetRole === facts.nextRole) return `This account is already ${facts.nextRole === "ADMIN" ? "an admin" : "a regular customer"}.`;
  if (facts.nextRole === "ADMIN" && facts.targetBlocked) return "Unblock this account before making it an admin.";
  if (facts.nextRole === "USER" && facts.otherActiveAdmins < 1) return "You can't remove the last active admin.";
  return null;
}
