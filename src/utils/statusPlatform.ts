export const PLATFORMS = ["incident", "instatus", "atlassian", "generic", "wake"] as const;
export type Platform = (typeof PLATFORMS)[number];
