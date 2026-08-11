import { describe, it, expect } from "vitest";
import { routesInclude } from "@workspace/roles";
import { NAV_PAGES, filterByRouteAccess } from "./nav-pages";

describe("filterByRouteAccess", () => {
  it("drops items whose href is not accessible", () => {
    const items = [{ href: "/a" }, { href: "/b" }];
    const result = filterByRouteAccess(items, (href) => href === "/a");
    expect(result).toEqual([{ href: "/a" }]);
  });

  it("always keeps items with no href, regardless of access", () => {
    const items = [{ href: "/a" }, { label: "toggle theme" }];
    const result = filterByRouteAccess(items, () => false);
    expect(result).toEqual([{ label: "toggle theme" }]);
  });
});

describe("NAV_PAGES (command palette + shortcuts + shortcuts-help source of truth)", () => {
  it("has a unique shortcutKey per entry (all share the same 'g' prefix namespace)", () => {
    const keys = NAV_PAGES.filter((p) => p.shortcutKey).map((p) => p.shortcutKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Regression coverage for the bug the command palette, global shortcuts,
  // and shortcuts-help dialog all shared: they used to list every page
  // regardless of what the role's effective routes actually allowed.
  it("drops exactly the page(s) a role's saved routes revoke", () => {
    const roleRoutesWithoutCovers = NAV_PAGES.map((p) => p.href).filter((href) => href !== "/cover");
    const hasAccess = (href: string) => routesInclude(roleRoutesWithoutCovers, href);

    const visible = filterByRouteAccess(NAV_PAGES, hasAccess);

    expect(visible.some((p) => p.href === "/cover")).toBe(false);
    expect(visible.length).toBe(NAV_PAGES.length - 1);
    // Nothing else was collateral damage.
    for (const page of NAV_PAGES) {
      if (page.href === "/cover") continue;
      expect(visible.some((p) => p.href === page.href)).toBe(true);
    }
  });

  it("keeps every page when the role's routes are \"*\" (ceo/tester)", () => {
    const hasAccess = (href: string) => routesInclude("*", href);
    const visible = filterByRouteAccess(NAV_PAGES, hasAccess);
    expect(visible.length).toBe(NAV_PAGES.length);
  });

  it("keeps only the home route when the role has no other routes", () => {
    const hasAccess = (href: string) => routesInclude(["/mi-dia"], href);
    const visible = filterByRouteAccess(NAV_PAGES, hasAccess);
    expect(visible).toEqual([]); // none of NAV_PAGES is "/mi-dia" in this synthetic case
  });
});
