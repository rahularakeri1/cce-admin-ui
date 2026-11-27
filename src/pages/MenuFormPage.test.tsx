import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockDb } from "../mocks/handlers";
import { renderMenus } from "../test-utils/menus";

const field = (name: RegExp) => screen.getByLabelText(name);
const save = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });

const openDashboard = async () => {
  renderMenus("/menus/m-1"); // Dashboard, saved with ChartBarIcon
  await screen.findByRole("heading", { name: /Edit/ });
};

describe("MenuFormPage — no add (the catalog is edit-only)", () => {
  it("/menus/new goes back to the table: there is no add form", async () => {
    renderMenus("/menus/new");
    expect(await screen.findByRole("heading", { name: "Menus" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Add menu" })).not.toBeInTheDocument();
  });
});

describe("MenuFormPage — icon", () => {
  const preview = () => screen.getByRole("img", { name: "Preview of the chosen icon" });

  it("suggests the icons this console can draw", async () => {
    await openDashboard();
    const options = document.querySelectorAll("#menu-icon-names option");
    expect(options.length).toBeGreaterThanOrEqual(60);
    expect(document.querySelector('#menu-icon-names option[value="ChartBarIcon"]')).not.toBeNull();
    expect(field(/^Icon/)).toHaveAttribute("list", "menu-icon-names");
  });

  it("previews a known icon as you type, with nothing flagged", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.clear(field(/^Icon/));
    expect(preview().querySelector("svg")).toBeNull();
    await user.type(field(/^Icon/), "CalendarIcon");

    expect(preview().querySelector("svg")).not.toBeNull();
    expect(screen.queryByText(/isn't a known icon|can't draw/)).not.toBeInTheDocument();
  });

  it("a case slip gets the fix offered, and the preview shows the placeholder meanwhile", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.clear(field(/^Icon/));
    await user.type(field(/^Icon/), "chartbaricon");

    expect(screen.getByText(/did you mean/)).toHaveTextContent("“chartbaricon” isn't a known icon — did you mean ChartBarIcon?");
    expect(preview().querySelector("[title]")).toHaveAttribute("title", expect.stringContaining("chartbaricon"));
  });

  it("an unknown name is flagged but still saves (another console may know more icons)", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.clear(field(/^Icon/));
    await user.type(field(/^Icon/), "SomeOtherIcon");

    expect(screen.getByText(/isn't an icon this console can draw. It will still save, but shows a \? here/)).toBeInTheDocument();
    await user.click(save());

    await screen.findByRole("status");
    expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "dashboard", icon: "SomeOtherIcon" });
  });

  it("editing shows the saved icon straight away", async () => {
    await openDashboard();
    expect(field(/^Icon/)).toHaveValue("ChartBarIcon");
    expect(preview().querySelector("svg")).not.toBeNull();
  });

  it("clearing the icon clears the preview and saves with none", async () => {
    await openDashboard();
    const user = userEvent.setup();

    await user.clear(field(/^Icon/));
    expect(preview().querySelector("svg")).toBeNull();
    await user.click(save());

    await screen.findByRole("status");
    expect(mockDb.lastMenuBody).not.toHaveProperty("icon");
    expect(mockDb.menus[0].icon).toBeNull();
  });
});

describe("MenuFormPage — icon picker", () => {
  const browse = () => screen.getByRole("button", { name: "Browse icons" });
  const picker = () => screen.queryByRole("group", { name: "Choose an icon" });
  const preview = () => screen.getByRole("img", { name: "Preview of the chosen icon" });

  it("is closed until Browse icons is pressed, and says it is expandable", async () => {
    await openDashboard();
    expect(picker()).not.toBeInTheDocument();
    expect(browse()).toHaveAttribute("aria-expanded", "false");

    await userEvent.setup().click(browse());

    expect(picker()).toBeInTheDocument();
    expect(browse()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("searchbox", { name: "Search icons" })).toHaveFocus();
  });

  it("choosing an icon fills the field and the preview, closes the picker and returns focus", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.click(browse());

    await user.click(within(picker()!).getByRole("button", { name: "StarIcon" }));

    expect(field(/^Icon/)).toHaveValue("StarIcon");
    expect(preview().querySelector("svg")).not.toBeNull();
    expect(picker()).not.toBeInTheDocument();
    expect(browse()).toHaveFocus();
  });

  it("the chosen icon is what gets saved", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.click(browse());
    await user.click(within(picker()!).getByRole("button", { name: "StarIcon" }));
    await user.click(save());

    await screen.findByRole("status");
    expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "dashboard", icon: "StarIcon" });
  });

  it("searching narrows the grid, and the match can be chosen", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.click(browse());
    await user.type(screen.getByRole("searchbox"), "calendar");

    const names = within(picker()!).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toContain("CalendarIcon");
    expect(names).not.toContain("ChartBarIcon");
    await user.click(within(picker()!).getByRole("button", { name: "CalendarIcon" }));
    expect(field(/^Icon/)).toHaveValue("CalendarIcon");
  });

  it("None clears a previously chosen icon", async () => {
    await openDashboard(); // Dashboard has ChartBarIcon
    const user = userEvent.setup();
    await user.click(browse());
    expect(within(picker()!).getByRole("button", { name: "ChartBarIcon" })).toHaveAttribute("aria-pressed", "true"); // the current one

    await user.click(within(picker()!).getByRole("button", { name: "None" }));

    expect(field(/^Icon/)).toHaveValue("");
    expect(preview().querySelector("svg")).toBeNull();
    await user.click(save());
    await screen.findByRole("status");
    expect(mockDb.menus[0].icon).toBeNull();
  });

  it("Escape and Close shut it without changing the field", async () => {
    await openDashboard();
    const user = userEvent.setup();

    await user.click(browse());
    await user.keyboard("{Escape}");
    expect(picker()).not.toBeInTheDocument();
    expect(field(/^Icon/)).toHaveValue("ChartBarIcon");
    expect(browse()).toHaveFocus();

    await user.click(browse());
    await user.click(within(picker()!).getByRole("button", { name: "Close" }));
    expect(picker()).not.toBeInTheDocument();
    expect(field(/^Icon/)).toHaveValue("ChartBarIcon");
  });

  it("Enter in the search box never submits the form", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.click(browse());

    await user.type(screen.getByRole("searchbox"), "chart{Enter}");

    expect(mockDb.lastMenuBody).toBeNull(); // nothing was sent
    expect(screen.getByRole("heading", { name: /Edit/ })).toBeInTheDocument();
    expect(picker()).toBeInTheDocument();
  });

  it("an unknown name already in the field is shown in the picker as the current value", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.clear(field(/^Icon/));
    await user.type(field(/^Icon/), "SomeOtherIcon");
    await user.click(browse());

    expect(within(picker()!).getByText(/Current value:/)).toHaveTextContent("SomeOtherIcon");
  });

  it("choosing from the picker clears the unknown-name warning", async () => {
    await openDashboard();
    const user = userEvent.setup();
    await user.clear(field(/^Icon/));
    await user.type(field(/^Icon/), "NopeIcon");
    expect(screen.getByText(/can draw/)).toBeInTheDocument();

    await user.click(browse());
    await user.click(within(picker()!).getByRole("button", { name: "UsersIcon" }));

    expect(screen.queryByText(/isn't an icon this console can draw/)).not.toBeInTheDocument();
  });

  it("opening the picker on a protected admin tab works the same", async () => {
    renderMenus("/menus/m-a4");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: /Edit/ });
    await user.click(browse());
    await user.click(within(picker()!).getByRole("button", { name: "StarIcon" }));
    await user.click(save());

    await screen.findByRole("status");
    expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "admin-protocols", path: "/protocols", icon: "StarIcon", isActive: true });
  });
});

describe("MenuFormPage — edit", () => {
  it("loads the entry, with the key read-only and explained", async () => {
    renderMenus("/menus/m-2");
    expect(await screen.findByRole("heading", { name: "Edit “Facilities”" })).toBeInTheDocument();
    expect(field(/^Key/)).toHaveValue("facilities");
    expect(field(/^Key/)).toHaveAttribute("readonly");
    expect(screen.getByText(/Fixed once created/)).toBeInTheDocument();
    expect(field(/^Label/)).toHaveValue("Facilities");
    expect(field(/^Path/)).not.toHaveAttribute("readonly");
    expect(screen.getByText(/Must be a page the app has/)).toBeInTheDocument(); // an Insights path needs a page behind it
    expect(screen.queryByLabelText(/sort/i)).not.toBeInTheDocument();
  });

  it("saves changes, sending the unchanged key, and returns to the list", async () => {
    renderMenus("/menus/m-2");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: /Edit/ });

    await user.clear(field(/^Label/));
    await user.type(field(/^Label/), "Sites");
    await user.click(field(/^Active/));
    await user.click(save());

    expect(await screen.findByRole("status")).toHaveTextContent("Saved “Sites”.");
    expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "facilities", label: "Sites", path: "/facilities", isActive: false });
    expect(mockDb.lastMenuBody).not.toHaveProperty("sortOrder"); // an edit never moves it
    expect(mockDb.menus.find((m) => m.menuKey === "facilities")?.sortOrder).toBe(2);
    expect(await screen.findByRole("row", { name: /Sites/ })).toBeInTheDocument();
  });

  it("an unknown id says the menu was not found", async () => {
    renderMenus("/menus/nope");
    expect(await screen.findByText("Menu not found.")).toBeInTheDocument();
  });

  it("a menu that no longer exists is reported when saving", async () => {
    renderMenus("/menus/m-2");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: /Edit/ });
    mockDb.failNext = { status: 404, code: "MENU_NOT_FOUND", message: "No menu" };
    await user.type(field(/^Label/), "x");
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("This menu no longer exists.");
  });

  describe("one of the admin console's own tabs", () => {
    it("has its key and path read-only and Active locked on, with an explanation", async () => {
      renderMenus("/menus/m-a4");
      expect(await screen.findByRole("heading", { name: "Edit “Protocols”" })).toBeInTheDocument();

      expect(screen.getByText(/key and path are fixed and it can't be deactivated/)).toBeInTheDocument();
      expect(field(/^Key/)).toHaveAttribute("readonly");
      expect(field(/^Path/)).toHaveAttribute("readonly");
      expect(field(/^Active/)).toBeChecked();
      expect(field(/^Active/)).toBeDisabled();
      expect(screen.getByText("Admin console")).toBeInTheDocument();
    });

    it("can still change its label and sort order, always sending the same path and active", async () => {
      renderMenus("/menus/m-a4");
      const user = userEvent.setup();
      await screen.findByRole("heading", { name: /Edit/ });

      await user.clear(field(/^Label/));
      await user.type(field(/^Label/), "Protocol library");
      await user.click(save());

      expect(await screen.findByRole("status")).toHaveTextContent("Saved “Protocol library”.");
      expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "admin-protocols", label: "Protocol library", path: "/protocols", isActive: true });
    });
  });
});
