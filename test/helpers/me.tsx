import React, { type ReactElement } from "react";

import { type Me,MeContext } from "@public/components/MeContext";

import { render } from "@testing-library/react";

import { Providers } from "./public-render";

export const ME_FIXTURE: Me = {
  uid: "uid-test",
  username: "gsbenevides2",
  name: "Guilherme Benevides",
  routes: ["GET /api/tuya/devices"],
  resources: [
    { resourceType: "tuya_device", resourceId: "d1", action: "read" },
  ],
};

/** A `"GET /api/me"` useApi handler. */
export const meApiHandler = () => ME_FIXTURE;

/** Renders with toast/confirm providers and a preset current user (no fetch). */
export function renderWithMe(ui: ReactElement, me: Me = ME_FIXTURE) {
  return render(
    <MeContext.Provider value={{ me }}>{ui}</MeContext.Provider>,
    { wrapper: Providers },
  );
}
