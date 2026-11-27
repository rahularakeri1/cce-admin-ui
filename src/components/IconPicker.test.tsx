import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconPicker } from "./IconPicker";
import { MENU_ICON_NAMES } from "../lib/menuIcons";

function setup(value = "") {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<IconPicker value={value} onChoose={onChoose} onClose={onClose} />);
  return { user, onChoose, onClose };
}
const grid = () => within(screen.getByRole("group", { name: "Icons" }));

describe("IconPicker", () => {
  it("shows every icon as a picture with its name, plus None", () => {
    setup();
    const buttons = grid().getAllByRole("button");
    expect(buttons).toHaveLength(MENU_ICON_NAMES.length + 1);
    expect(grid().getByRole("button", { name: "None" })).toBeInTheDocument();
    for (const name of ["ChartBarIcon", "UsersIcon", "Bars3Icon"]) {
      const b = grid().getByRole("button", { name });
      expect(b.querySelector("svg"), name).not.toBeNull(); // a picture, not just text
      expect(b).toHaveAttribute("title", name);
    }
    expect(screen.getByText(`${MENU_ICON_NAMES.length} of ${MENU_ICON_NAMES.length} icons`, { exact: false })).toBeInTheDocument();
  });

  it("starts with the search box focused", () => {
    setup();
    expect(screen.getByRole("searchbox", { name: "Search icons" })).toHaveFocus();
  });

  it("clicking an icon chooses it", async () => {
    const { user, onChoose } = setup();
    await user.click(grid().getByRole("button", { name: "ChartBarIcon" }));
    expect(onChoose).toHaveBeenCalledWith("ChartBarIcon");
  });

  it("None chooses the empty value", async () => {
    const { user, onChoose } = setup("ChartBarIcon");
    await user.click(grid().getByRole("button", { name: "None" }));
    expect(onChoose).toHaveBeenCalledWith("");
  });

  it("highlights the current icon, or None when there isn't one", () => {
    const withIcon = render(<IconPicker value="UsersIcon" onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(within(withIcon.container).getByRole("button", { name: "UsersIcon" })).toHaveAttribute("aria-pressed", "true");
    expect(within(withIcon.container).getByRole("button", { name: "ChartBarIcon" })).toHaveAttribute("aria-pressed", "false");
    expect(within(withIcon.container).getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "false");
    withIcon.unmount();

    const none = render(<IconPicker value="" onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(within(none.container).getByRole("button", { name: "None" })).toHaveAttribute("aria-pressed", "true");
  });

  it("search filters by name, case-insensitively, and counts the matches", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("searchbox"), "CHART");

    const names = grid().getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toContain("None"); // None stays available while searching
    expect(names).toEqual(expect.arrayContaining(["ChartBarIcon", "ChartPieIcon"]));
    expect(names.filter((n) => n !== "None").every((n) => n!.toLowerCase().includes("chart"))).toBe(true);
    expect(names).not.toContain("UsersIcon");
    expect(screen.getByText(/of \d+ icons/)).toHaveTextContent(new RegExp(`${names.length - 1} of ${MENU_ICON_NAMES.length} icons`));
  });

  it("says so when nothing matches", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("searchbox"), "zzzz");
    expect(screen.getByText("No icons match “zzzz”.")).toBeInTheDocument();
    expect(grid().getAllByRole("button")).toHaveLength(1); // only None
  });

  it("a saved name outside the set is shown as the current value and flagged", () => {
    setup("SomeOtherIcon");
    expect(screen.getByText(/Current value:/)).toHaveTextContent("SomeOtherIcon");
    expect(screen.getByText(/not in this set/)).toBeInTheDocument();
  });

  it("no flag for a known current icon or none", () => {
    setup("UsersIcon");
    expect(screen.queryByText(/Current value:/)).not.toBeInTheDocument();
  });

  it("Escape and Close both close it", async () => {
    const { user, onClose } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  describe("keyboard", () => {
    it("is one tab stop, not sixty-six", () => {
      setup("UsersIcon");
      const stops = grid().getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
      expect(stops).toHaveLength(1);
      expect(stops[0]).toHaveAccessibleName("UsersIcon"); // the current icon
    });

    it("ArrowDown from the search box enters the grid, arrows move, Enter chooses", async () => {
      const { user, onChoose } = setup();
      await user.click(screen.getByRole("searchbox"));
      await user.keyboard("{ArrowDown}");
      expect(grid().getByRole("button", { name: "None" })).toHaveFocus();

      await user.keyboard("{ArrowRight}");
      expect(grid().getByRole("button", { name: MENU_ICON_NAMES[0] })).toHaveFocus();
      await user.keyboard("{ArrowRight}");
      expect(grid().getByRole("button", { name: MENU_ICON_NAMES[1] })).toHaveFocus();
      await user.keyboard("{ArrowLeft}");
      await user.keyboard("{Enter}");
      expect(onChoose).toHaveBeenCalledWith(MENU_ICON_NAMES[0]);
    });

    it("ArrowDown / ArrowUp move a whole row (six cells), and Home / End jump to the ends", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("searchbox"));
      await user.keyboard("{ArrowDown}"); // None = cell 0
      await user.keyboard("{ArrowDown}");
      expect(grid().getByRole("button", { name: MENU_ICON_NAMES[5] })).toHaveFocus(); // cell 6 = icon index 5
      await user.keyboard("{ArrowUp}");
      expect(grid().getByRole("button", { name: "None" })).toHaveFocus();
      await user.keyboard("{End}");
      expect(grid().getByRole("button", { name: MENU_ICON_NAMES[MENU_ICON_NAMES.length - 1] })).toHaveFocus();
      await user.keyboard("{Home}");
      expect(grid().getByRole("button", { name: "None" })).toHaveFocus();
    });

    it("the arrows stop at the ends instead of wrapping or going off", async () => {
      const { user } = setup();
      await user.click(screen.getByRole("searchbox"));
      await user.keyboard("{ArrowDown}{ArrowLeft}{ArrowUp}");
      expect(grid().getByRole("button", { name: "None" })).toHaveFocus();
      await user.keyboard("{End}{ArrowRight}{ArrowDown}");
      expect(grid().getByRole("button", { name: MENU_ICON_NAMES[MENU_ICON_NAMES.length - 1] })).toHaveFocus();
    });

    it("Enter in the search box chooses a single match, and otherwise does nothing (it must never submit a form)", async () => {
      const { user, onChoose } = setup();
      const search = screen.getByRole("searchbox");
      await user.type(search, "chart{Enter}");
      expect(onChoose).not.toHaveBeenCalled(); // several matches

      await user.clear(search);
      await user.type(search, "BuildingOffice2{Enter}");
      expect(onChoose).toHaveBeenCalledWith("BuildingOffice2Icon");
    });
  });
});
