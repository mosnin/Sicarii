import { convexAuth } from "@convex-dev/auth/server";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // OAuth providers give Scalar a verified identity without storing user
  // passwords. Provider credentials live only in the Convex deployment.
  providers: [Google, GitHub],
});
