import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockDb } from "../mocks/handlers";
import { renderMenus } from "../test-utils/menus";

const field = (name: RegExp) => screen.getByLabelText(name);
const save = () => screen.getByRole("button", { name: /^(Save|Saving…)$/ });

async function fillNew(user: ReturnType<typeof userEvent.setup>, v: { key?: string; label?: string; path?: string; icon?: string; sort?: string }) {
  if (v.key !== undefined) await user.type(field(/^Key/), v.key);
  if (v.label !== undefined) await user.type(field(/^Label/), v.label);
  if (v.path !== undefined) await user.type(field(/^Path/), v.path);
  if (v.icon !== undefined) await user.type(field(/^Icon/), v.icon);
  if (v.sort !== undefined) {
    await user.clear(field(/^Sort order/));
    await user.type(field(/^Sort order/), v.sort);
  }
}

describe("MenuFormPage — add", () => {
  it("starts empty, Insights-only, active, and explains the key is permanent", () => {
    renderMenus("/menus/new");
    expect(screen.getByRole("heading", { name: "Add menu" })).toBeInTheDocument();
    expect(field(/^Key/)).toHaveValue("");
    expect(field(/^Sort order/)).toHaveValue(0);
    expect(field(/^Active/)).toBeChecked();
    expect(screen.getByText(/Can't be changed later/)).toBeInTheDocument();
    expect(screen.getByText("Insights")).toBeInTheDocument();
    expect(screen.getByText(/admin console's tabs come from a migration/)).toBeInTheDocument();
  });

  it("refuses bad input in the browser, field by field, without calling the server", async () => {
    renderMenus("/menus/new");
    const user = userEvent.setup();
    await fillNew(user, { key: "Bad Key", path: "no-slash", sort: "-1" });
    await user.click(save());

    expect(await screen.findByText("Use lower-case letters, digits, - or _, e.g. reports")).toBeInTheDocument();
    expect(screen.getByText("Label is required")).toBeInTheDocument();
    expect(screen.getByText("Path must start with /")).toBeInTheDocument();
    expect(screen.getByText("Zero or more")).toBeInTheDocument();
    expect(mockDb.lastMenuBody).toBeNull();
  });

  it("creates the entry (never sending a console), returns to the list with a message and the new row highlighted", async () => {
    renderMenus("/menus/new");
    const user = userEvent.setup();
    await fillNew(user, { key: "reports", label: "Reports", path: "/reports", icon: "ChartBarIcon", sort: "8" });
    await user.click(save());

    expect(await screen.findByRole("status")).toHaveTextContent("Added “Reports”. Now assign it to roles on the Roles screen.");
    expect(mockDb.lastMenuBody).toEqual({ menuKey: "reports", label: "Reports", path: "/reports", icon: "ChartBarIcon", sortOrder: 8, isActive: true });
    expect(mockDb.lastMenuBody).not.toHaveProperty("console");
    const row = await screen.findByRole("row", { name: /Reports/ });
    expect(row).toHaveClass("bg-blue-50");
    expect(mockDb.menus.find((m) => m.menuKey === "reports")?.console).toBe("INSIGHTS");
  });

  it("an unticked Active creates it inactive", async () => {
    renderMenus("/menus/new");
    const user = userEvent.setup();
    await fillNew(user, { key: "later", label: "Later", path: "/later" });
    await user.click(field(/^Active/));
    await user.click(save());

    await screen.findByRole("status");
    expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "later", isActive: false });
  });

  it("a duplicate key is explained next to the key field, and what was typed is kept", async () => {
    renderMenus("/menus/new");
    const user = userEvent.setup();
    await fillNew(user, { key: "facilities", label: "Another facilities", path: "/other" });
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("Key already in use: facilities. Pick another.");
    expect(field(/^Label/)).toHaveValue("Another facilities");
    expect(screen.getByRole("heading", { name: "Add menu" })).toBeInTheDocument();
    expect(mockDb.menus).toHaveLength(7); // the 3 insights menus + 4 admin tabs: nothing was added
  });

  it("a server failure is shown and the form stays", async () => {
    mockDb.failNext = { status: 500, code: "INTERNAL", message: "Something broke on the server" };
    renderMenus("/menus/new");
    const user = userEvent.setup();
    await fillNew(user, { key: "reports", label: "Reports", path: "/reports" });
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("Something broke on the server");
    expect(field(/^Key/)).toHaveValue("reports");
  });

  it("a 403 says the role may not change menus", async () => {
    mockDb.failNext = { status: 403, code: "FORBIDDEN", message: "Access denied" };
    renderMenus("/menus/new");
    const user = userEvent.setup();
    await fillNew(user, { key: "reports", label: "Reports", path: "/reports" });
    await user.click(save());

    expect(await screen.findByText("You don't have permission to do this.")).toBeInTheDocument();
    expect(screen.getByText("You can't change menus.")).toBeInTheDocument();
  });

  it("disables Save while saving", async () => {
    renderMenus("/menus/new");
    const user = userEvent.setup();
    await fillNew(user, { key: "reports", label: "Reports", path: "/reports" });
    const click = user.click(save());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    await click;
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
    expect(field(/^Sort order/)).toHaveValue(2);
  });

  it("saves changes, sending the unchanged key, and returns to the list", async () => {
    renderMenus("/menus/m-2");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: /Edit/ });

    await user.clear(field(/^Label/));
    await user.type(field(/^Label/), "Sites");
    await user.clear(field(/^Sort order/));
    await user.type(field(/^Sort order/), "9");
    await user.click(field(/^Active/));
    await user.click(save());

    expect(await screen.findByRole("status")).toHaveTextContent("Saved “Sites”.");
    expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "facilities", label: "Sites", path: "/facilities", sortOrder: 9, isActive: false });
    expect(await screen.findByRole("row", { name: /Sites/ })).toBeInTheDocument();
  });

  it("an unknown id says the menu was not found", async () => {
    renderMenus("/menus/nope");
    expect(await screen.findByText("Menu not found.")).toBeInTheDocument();
  });

  it("a menu deleted underneath the form is reported when saving", async () => {
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
