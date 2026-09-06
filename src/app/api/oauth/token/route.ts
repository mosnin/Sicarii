// Compatibility alias for clients configured before the stateful OAuth server
// moved to /oauth. Both paths share single-use codes and hashed tokens.
export { POST, OPTIONS } from "@/app/oauth/token/route";
