import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockDb } from "../mocks/handlers";
import { renderMenus } from "../test-utils/menus";

const rowOf = (name: RegExp) => screen.getByRole("row", { name });

describe("MenusCatalogPage", () => {
  it("lists the catalog grouped Insights then Admin console, with key, path, sort order and status", async () => {
    mockDb.menus[2].isActive = false; // Compliance
    renderMenus("/menus");

    const insights = within(await screen.findByRole("rowgroup", { name: "Insights" }));
    const admin = within(screen.getByRole("rowgroup", { name: "Admin console" }));
    expect(insights.getAllByRole("row")).toHaveLength(4); // group header + 3 menus
    expect(admin.getAllByRole("row")).toHaveLength(5); // group header + 4 tabs
    const dashboard = within(rowOf(/Dashboard/));
    expect(dashboard.getByText("dashboard")).toBeInTheDocument();
    expect(dashboard.getByText("Active")).toBeInTheDocument();
    expect(within(rowOf(/Compliance/)).getByText("Inactive")).toBeInTheDocument();
    expect(admin.getByText("/protocols")).toBeInTheDocument();
  });

  it("offers + Add menu", async () => {
    renderMenus("/menus");
    expect(await screen.findByRole("link", { name: "+ Add menu" })).toHaveAttribute("href", "/menus/new");
  });

  it("explains that role assignment lives on the role's Menus tab", async () => {
    renderMenus("/menus");
    expect(await screen.findByText(/set on each role's Menus tab/)).toBeInTheDocument();
  });

  describe("the four admin tabs are protected", () => {
    it("cannot be deactivated or deleted from the screen, and say why; Edit is still there", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Admin console" });

      for (const label of ["Users", "Roles", "Menus", "Protocols"]) {
        expect(screen.getByRole("button", { name: `Deactivate ${label}` })).toBeDisabled();
        expect(screen.getByRole("button", { name: `Delete ${label}` })).toBeDisabled();
        expect(screen.getByRole("button", { name: `Delete ${label}` })).toHaveAttribute("title", expect.stringMatching(/Protected/));
        expect(screen.getByRole("link", { name: `Edit ${label}` })).toBeInTheDocument();
      }
    });

    it("an insights entry has all three actions enabled", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });
      expect(screen.getByRole("button", { name: "Deactivate Dashboard" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Delete Dashboard" })).toBeEnabled();
      expect(screen.getByRole("link", { name: "Edit Dashboard" })).toHaveAttribute("href", "/menus/m-1");
    });
  });

  describe("deactivate / activate", () => {
    it("deactivating sends the whole entry with isActive false, then shows Inactive from a real refetch", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Deactivate Facilities" }));

      expect(await within(rowOf(/Facilities/)).findByText("Inactive")).toBeInTheDocument();
      expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "facilities", label: "Facilities", path: "/facilities", sortOrder: 2, isActive: false });
      expect(screen.getByRole("status")).toHaveTextContent(/Deactivated “Facilities”.*role assignments are kept/);
      expect(screen.getByRole("button", { name: "Activate Facilities" })).toBeInTheDocument();
    });

    it("activating brings it back", async () => {
      mockDb.menus[1].isActive = false;
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Activate Facilities" }));

      expect(await within(rowOf(/Facilities/)).findByText("Active")).toBeInTheDocument();
      expect(mockDb.menus[1].isActive).toBe(true);
    });

    it("a server refusal shows next to that row, and nothing changes", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      mockDb.failNext = { status: 409, code: "ADMIN_MENU_PROTECTED", message: "That one is protected" };
      await user.click(screen.getByRole("button", { name: "Deactivate Dashboard" }));

      expect(await within(rowOf(/Dashboard/)).findByRole("alert")).toHaveTextContent("That one is protected");
      expect(mockDb.menus[0].isActive).toBe(true);
    });
  });

  describe("delete", () => {
    it("asks first, naming the real consequence and pointing at Deactivate", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Delete Compliance" }));

      const dialog = screen.getByRole("dialog", { name: /Delete “Compliance”\?/ });
      expect(dialog).toHaveTextContent(/also removes it from every role that has it.*can't be undone/);
      expect(dialog).toHaveTextContent(/use Deactivate instead.*role assignments are kept/);
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
      expect(mockDb.menuDeleteCalls).toBe(0);
    });

    it("Cancel and Escape change nothing", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Delete Compliance" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Delete Compliance" }));
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mockDb.menuDeleteCalls).toBe(0);
      expect(mockDb.menus.some((m) => m.menuKey === "compliance")).toBe(true);
    });

    it("confirming deletes it, removes exactly its role assignments, and says so", async () => {
      mockDb.roleMenus["r-1"] = ["m-1", "m-3"]; // Dashboard, Compliance
      mockDb.roleMenus["r-2"] = ["m-3"];
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Delete Compliance" }));
      await user.click(screen.getByRole("button", { name: "Delete menu" }));

      await waitFor(() => expect(screen.queryByRole("row", { name: /Compliance/ })).not.toBeInTheDocument());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/Deleted “Compliance”, and removed it from every role/);
      expect(mockDb.roleMenus["r-1"]).toEqual(["m-1"]); // the other menu is untouched
      expect(mockDb.roleMenus["r-2"]).toEqual([]);
    });

    it("an already-deleted entry says so in the dialog and the list refreshes", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });
      await user.click(screen.getByRole("button", { name: "Delete Compliance" }));
      mockDb.menus = mockDb.menus.filter((m) => m.menuKey !== "compliance"); // someone else deleted it

      await user.click(screen.getByRole("button", { name: "Delete menu" }));

      expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(/no longer exists/);
    });

    it("a 403 says the role may not change menus", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });
      await user.click(screen.getByRole("button", { name: "Delete Compliance" }));

      mockDb.failNext = { status: 403, code: "FORBIDDEN", message: "Access denied" };
      await user.click(screen.getByRole("button", { name: "Delete menu" }));

      expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("Your role isn't allowed to change menus.");
    });
  });

  it("shows the flash message and highlights the saved row when coming back from the form", async () => {
    renderMenus("/menus", { saved: "Added “Facilities”. Now assign it to roles on the Roles screen.", highlight: "facilities" });

    expect(await screen.findByRole("status")).toHaveTextContent("Added “Facilities”. Now assign it to roles on the Roles screen.");
    expect(rowOf(/Facilities/)).toHaveClass("bg-blue-50");
    expect(rowOf(/Dashboard/)).not.toHaveClass("bg-blue-50");
  });

  it("says so when the catalog can't be loaded, and when the role may not view it", async () => {
    mockDb.menuLoadFailNext = { status: 403, code: "FORBIDDEN", message: "Access denied" };
    const first = renderMenus("/menus");
    expect(await screen.findByText("You don't have permission to do this.")).toBeInTheDocument();
    first.unmount();

    mockDb.menuLoadFailNext = { status: 500, code: "INTERNAL", message: "boom" };
    renderMenus("/menus");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not load the menu catalog/);
  });
});
