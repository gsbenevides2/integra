import path from "node:path";

import { openapi as elysiaOpenapi } from "@elysia/openapi";

import {
  author,
  description,
  license,
  repository,
  title,
  version,
} from "./utils/getProjectInfo";

const licenseUrl = new URL(repository.url);

licenseUrl.pathname = path.posix.join(
  licenseUrl.pathname,
  "/blob/main/LICENSE",
);

export const openapi = elysiaOpenapi({
  documentation: {
    info: {
      title,
      version,
      contact: {
        email: author.email,
        name: author.name,
        url: author.url,
      },
      description,
      license: {
        name: license,
        url: licenseUrl.toString(),
      },
    },
  },
  scalar: {
    withDefaultFonts: false,
    showDeveloperTools: "localhost",
    hideDarkModeToggle: true,
    forceDarkModeState: "dark",
  },
});
