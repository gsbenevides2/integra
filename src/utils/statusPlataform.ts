export const PLATAFORMS = ["incident", "instatus", "atlassian", "generic", "wake"] as const;
export type Plataform = (typeof PLATAFORMS)[number];
