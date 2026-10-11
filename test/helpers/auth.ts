import { authzTestOverride } from "@server/shared/authz";

/** The identity the module tests run as. */
export const TEST_USER = {
  id: "test-user-id",
  uid: "test-uid",
  username: "test-user",
  name: "Test User",
};

/**
 * Turns on the guard's test-only allow-all override for the current file. The
 * override is inert outside `NODE_ENV === "test"`, so this never weakens a real
 * process. Dedicated authz tests leave it off and exercise the real checks.
 */
export function installTestAuthz(): () => void {
  authzTestOverride.mode = "allow-all";
  authzTestOverride.user = TEST_USER;
  return () => {
    authzTestOverride.mode = null;
    authzTestOverride.user = null;
  };
}
