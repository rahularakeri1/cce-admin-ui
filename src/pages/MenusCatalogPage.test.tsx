import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  describe("icons", () => {
    const iconOf = (row: RegExp) => within(rowOf(row)).queryAllByRole("cell")[2].querySelector("svg");

    it("draws each entry's saved icon before its label", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });

      for (const row of [/Dashboard/, /Facilities/, /Compliance/, /Users/, /Protocols/]) {
        expect(iconOf(row), String(row)).not.toBeNull();
      }
    });

    it("an entry with no icon shows none, and an inactive one keeps its icon (dimmed)", async () => {
      mockDb.menus[0].icon = null; // Dashboard
      mockDb.menus[1].isActive = false; // Facilities
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });

      expect(iconOf(/Dashboard/)).toBeNull();
      expect(iconOf(/Facilities/)).not.toBeNull();
    });

    it("a name this console can't draw shows a ? that names it, so a typo is visible", async () => {
      mockDb.menus[2].icon = "ClipbordIcon"; // Compliance, a typo
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });

      const cell = within(rowOf(/Compliance/)).getAllByRole("cell")[2];
      expect(cell.querySelector("[title]")).toHaveAttribute("title", "“ClipbordIcon” isn't an icon this console can draw");
      expect(cell.querySelector("svg")).not.toBeNull();
    });

    it("the icon doesn't change a row's accessible name or its actions", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });
      expect(screen.getByRole("button", { name: "Deactivate Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Edit Dashboard" })).toBeInTheDocument();
    });
  });

  it("is edit-only: no Add menu and no Delete anywhere on the screen", async () => {
    renderMenus("/menus");
    await screen.findByRole("rowgroup", { name: "Insights" });
    expect(screen.queryByRole("link", { name: /Add menu/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("explains that role assignment lives on the role's Menus tab", async () => {
    renderMenus("/menus");
    expect(await screen.findByText(/set on each role's Menus tab/)).toBeInTheDocument();
  });

  describe("the four admin tabs are protected", () => {
    it("cannot be deactivated from the screen, and say why; Edit is still there", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Admin console" });

      for (const label of ["Users", "Roles", "Menus", "Protocols"]) {
        expect(screen.getByRole("button", { name: `Deactivate ${label}` })).toBeDisabled();
        expect(screen.getByRole("button", { name: `Deactivate ${label}` })).toHaveAttribute("title", expect.stringMatching(/Protected/));
        expect(screen.getByRole("link", { name: `Edit ${label}` })).toBeInTheDocument();
      }
    });

    it("an insights entry has both actions enabled", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });
      expect(screen.getByRole("button", { name: "Deactivate Dashboard" })).toBeEnabled();
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
      expect(mockDb.lastMenuBody).toMatchObject({ menuKey: "facilities", label: "Facilities", path: "/facilities", isActive: false });
      expect(mockDb.lastMenuBody).not.toHaveProperty("sortOrder"); // toggling never moves it
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

  describe("arranging (drag and drop, or the arrows)", () => {
    const group = (name: string) => within(screen.getByRole("rowgroup", { name }));
    const order = (name: string) =>
      group(name)
        .getAllByRole("row")
        .slice(1) // the group's heading row
        .map((r) => within(r).getAllByRole("cell")[2].textContent);
    const positions = (name: string) =>
      group(name)
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getAllByRole("cell")[1].textContent);
    const bar = () => screen.queryByRole("group", { name: "Unsaved order" });
    const dt = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" });

    function drag(handleLabel: string, ontoRowName: RegExp) {
      const dataTransfer = dt();
      fireEvent.dragStart(screen.getByRole("button", { name: `Drag ${handleLabel} to reorder` }), { dataTransfer });
      const target = screen.getByRole("row", { name: ontoRowName });
      fireEvent.dragOver(target, { dataTransfer });
      fireEvent.drop(target, { dataTransfer });
      fireEvent.dragEnd(screen.getByRole("button", { name: `Drag ${handleLabel} to reorder` }), { dataTransfer });
    }

    it("shows positions 1..n instead of a sort column, and nothing to save", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });

      expect(positions("Insights")).toEqual(["1", "2", "3"]);
      expect(positions("Admin console")).toEqual(["1", "2", "3", "4"]);
      expect(screen.queryByRole("columnheader", { name: "Sort" })).not.toBeInTheDocument();
      expect(bar()).not.toBeInTheDocument();
    });

    it("the arrows move a row within its group; the first row can't go up and the last can't go down", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      expect(screen.getByRole("button", { name: "Move Dashboard up" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Move Compliance down" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Move Users up" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Move Protocols down" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));
      expect(order("Insights")).toEqual(["Facilities", "Dashboard", "Compliance"]);
      expect(positions("Insights")).toEqual(["1", "2", "3"]);
      await user.click(screen.getByRole("button", { name: "Move Compliance up" }));
      expect(order("Insights")).toEqual(["Facilities", "Compliance", "Dashboard"]);
    });

    it("an arrangement is only a draft: a bar offers Save order and Reset, and nothing is sent yet", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));

      expect(within(bar()!).getByText(/Order changed — not saved yet/)).toBeInTheDocument();
      expect(within(bar()!).getByRole("button", { name: "Save order" })).toBeEnabled();
      expect(mockDb.reorderCalls).toHaveLength(0);
      expect(mockDb.menus[0].sortOrder).toBe(1); // the server is untouched
    });

    it("Reset puts the saved order back and hides the bar", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });
      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));

      await user.click(within(bar()!).getByRole("button", { name: "Reset" }));

      expect(order("Insights")).toEqual(["Dashboard", "Facilities", "Compliance"]);
      expect(bar()).not.toBeInTheDocument();
    });

    it("moving a row back to where it was clears the draft", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));
      await user.click(screen.getByRole("button", { name: "Move Dashboard up" }));

      expect(bar()).not.toBeInTheDocument();
    });

    it("Save order sends the COMPLETE order of the changed group once, then shows the saved order from a refetch", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });
      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));

      await user.click(within(bar()!).getByRole("button", { name: "Save order" }));

      expect(await screen.findByRole("status")).toHaveTextContent("Saved the new order.");
      expect(mockDb.reorderCalls).toEqual([{ console: "INSIGHTS", menuIds: ["m-2", "m-1", "m-3"] }]);
      expect(bar()).not.toBeInTheDocument();
      expect(order("Insights")).toEqual(["Facilities", "Dashboard", "Compliance"]); // read back from the server
      expect(mockDb.menus.map((m) => [m.menuKey, m.sortOrder]).filter(([k]) => ["dashboard", "facilities", "compliance"].includes(k as string))).toEqual([
        ["dashboard", 2],
        ["facilities", 1],
        ["compliance", 3],
      ]);
    });

    it("dragging a row's handle onto another row of the same group moves it there", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });

      drag("Compliance", /Dashboard/);

      expect(order("Insights")).toEqual(["Compliance", "Dashboard", "Facilities"]);
      expect(bar()).toBeInTheDocument();
      expect(mockDb.reorderCalls).toHaveLength(0);
    });

    it("a drop onto the other group is ignored", async () => {
      renderMenus("/menus");
      await screen.findByRole("rowgroup", { name: "Insights" });

      drag("Dashboard", /Users/);

      expect(order("Insights")).toEqual(["Dashboard", "Facilities", "Compliance"]);
      expect(order("Admin console")).toEqual(["Users", "Roles", "Menus", "Protocols"]);
      expect(bar()).not.toBeInTheDocument();
    });

    it("the admin tabs can be arranged too, and save as their own group", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Admin console" });

      await user.click(screen.getByRole("button", { name: "Move Users down" }));
      await user.click(within(bar()!).getByRole("button", { name: "Save order" }));

      await screen.findByText("Saved the new order.");
      expect(mockDb.reorderCalls).toEqual([{ console: "ADMIN", menuIds: ["m-a2", "m-a1", "m-a3", "m-a4"] }]);
      expect(order("Admin console")).toEqual(["Roles", "Users", "Menus", "Protocols"]);
    });

    it("changes in both groups are saved as two calls", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });

      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));
      await user.click(screen.getByRole("button", { name: "Move Users down" }));
      await user.click(within(bar()!).getByRole("button", { name: "Save order" }));

      await screen.findByText("Saved the new order.");
      expect(mockDb.reorderCalls.map((c) => c.console)).toEqual(["INSIGHTS", "ADMIN"]);
    });

    it("a list that changed meanwhile is refused: it says so, reloads, drops the draft and shows the new entry", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });
      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));
      // another admin adds an entry while this one is arranging
      mockDb.menus.push({ id: "m-late", menuKey: "late", label: "Late arrival", path: "/late", icon: null, console: "INSIGHTS", sortOrder: 4, isActive: true });

      await user.click(within(bar()!).getByRole("button", { name: "Save order" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/The list changed while you were arranging it.*reloaded — arrange it again/);
      expect(bar()).not.toBeInTheDocument();
      expect(order("Insights")).toEqual(["Dashboard", "Facilities", "Compliance", "Late arrival"]); // the server's order, nothing dropped
    });

    it("an entry that disappeared from the list (e.g. after a release) drops out of the draft, which is then saved without it", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });
      await user.click(screen.getByRole("button", { name: "Move Dashboard down" })); // Facilities, Dashboard, Compliance
      mockDb.menus = mockDb.menus.filter((m) => m.menuKey !== "compliance"); // removed by a release
      await user.click(screen.getByRole("button", { name: "Deactivate Facilities" })); // any action refetches the list

      await waitFor(() => expect(order("Insights")).toEqual(["Facilities", "Dashboard"]));
      expect(bar()).toBeInTheDocument(); // the arrangement survived
      await user.click(within(bar()!).getByRole("button", { name: "Save order" }));

      await screen.findByText("Saved the new order.");
      expect(mockDb.reorderCalls).toEqual([{ console: "INSIGHTS", menuIds: ["m-2", "m-1"] }]);
    });

    it("a 403 says the role may not change menus and keeps the draft to try again", async () => {
      renderMenus("/menus");
      const user = userEvent.setup();
      await screen.findByRole("rowgroup", { name: "Insights" });
      await user.click(screen.getByRole("button", { name: "Move Dashboard down" }));

      mockDb.failNext = { status: 403, code: "FORBIDDEN", message: "Access denied" };
      await user.click(within(bar()!).getByRole("button", { name: "Save order" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Your role isn't allowed to change menus.");
      expect(bar()).toBeInTheDocument();
      expect(order("Insights")).toEqual(["Facilities", "Dashboard", "Compliance"]);
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
