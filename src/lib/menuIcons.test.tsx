import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { isKnownIcon, MENU_ICON_NAMES, MENU_ICONS, MenuIcon, suggestIcon } from "./menuIcons";

const SEEDED = [
  // the seven insights menus (they match cce-insights-ui's own Sidebar.tsx)…
  "ChartBarIcon",
  "BuildingOffice2Icon",
  "ClipboardDocumentCheckIcon",
  "ExclamationTriangleIcon",
  "SignalIcon",
  "CogIcon",
  // …and the four admin console tabs
  "UsersIcon",
  "ShieldCheckIcon",
  "Bars3Icon",
  "DocumentTextIcon",
];

describe("menu icons", () => {
  it("can draw every icon the seeded menus already use", () => {
    for (const name of SEEDED) expect(isKnownIcon(name), name).toBe(true);
  });

  it("offers a sorted, curated set of names", () => {
    expect(MENU_ICON_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(MENU_ICON_NAMES.length).toBeLessThan(100); // curated, not all 300+
    expect(MENU_ICON_NAMES).toEqual([...MENU_ICON_NAMES].sort());
    expect(new Set(MENU_ICON_NAMES).size).toBe(MENU_ICON_NAMES.length);
  });

  it("every offered name really draws an icon", () => {
    for (const name of Object.keys(MENU_ICONS)) {
      const { container, unmount } = render(<MenuIcon name={name} />);
      expect(container.querySelector("svg"), name).not.toBeNull();
      unmount();
    }
  });

  it("an icon is decoration: hidden from assistive technology", () => {
    const { container } = render(<MenuIcon name="UsersIcon" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("no name draws a blank of the same size, so labels stay aligned", () => {
    for (const name of [null, undefined, "", "   "]) {
      const { container, unmount } = render(<MenuIcon name={name} className="h-6 w-6" />);
      expect(container.querySelector("svg")).toBeNull();
      expect(container.firstElementChild).toHaveClass("h-6", "w-6");
      unmount();
    }
  });

  it("an unknown name shows a placeholder naming it, or a blank where asked", () => {
    const placeholder = render(<MenuIcon name="NopeIcon" />);
    expect(placeholder.container.querySelector("svg")).not.toBeNull();
    expect(placeholder.container.firstElementChild).toHaveAttribute("title", "“NopeIcon” isn't an icon this console can draw");
    placeholder.unmount();

    const blank = render(<MenuIcon name="NopeIcon" unknown="blank" />);
    expect(blank.container.querySelector("svg")).toBeNull();
  });

  it("names are case-sensitive, but a case slip gets a suggestion", () => {
    expect(isKnownIcon("chartbaricon")).toBe(false);
    expect(suggestIcon("chartbaricon")).toBe("ChartBarIcon");
    expect(suggestIcon(" ChartBarIcon ")).toBe("ChartBarIcon");
    expect(suggestIcon("NopeIcon")).toBeNull();
  });
});
