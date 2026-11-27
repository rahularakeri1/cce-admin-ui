import { useEffect, useMemo, useRef, useState } from "react";
import { isKnownIcon, MENU_ICON_NAMES, MenuIcon } from "../lib/menuIcons";

/** The grid is always this many columns wide, so Up/Down can move by one row without measuring the layout. */
const COLUMNS = 6;

/**
 * A grid of every icon this console can draw, as pictures with their names, so nobody needs to know the Heroicons
 * names. Click (or Enter) chooses; "None" clears; the search box filters by name; arrow keys move around the grid
 * (roving focus: one tab stop, not 65); Esc closes. It only reports the choice — the form owns the value.
 */
export function IconPicker({
  value,
  onChoose,
  onClose,
}: {
  /** The icon name currently in the form: highlighted if it is in the set, shown as "current" if it is not. */
  value: string;
  /** "" means None. */
  onChoose: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? MENU_ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : MENU_ICON_NAMES;
  }, [query]);
  // "None" is the first cell; the icons follow it.
  const items = useMemo(() => ["", ...shown], [shown]);
  const selectedIndex = Math.max(0, items.indexOf(value.trim()));
  const [active, setActive] = useState(selectedIndex);
  const tabStop = Math.min(active, items.length - 1);

  useEffect(() => searchRef.current?.focus(), []);

  function focusCell(index: number) {
    const next = Math.max(0, Math.min(index, items.length - 1));
    setActive(next);
    cells.current[next]?.focus();
  }

  function onGridKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
    if (e.key in moves) {
      e.preventDefault();
      focusCell(tabStop + moves[e.key]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusCell(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusCell(items.length - 1);
    }
  }

  const current = value.trim();

  return (
    <div
      role="group"
      aria-label="Choose an icon"
      className="rounded-md border border-gray-200 bg-white p-3 shadow-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusCell(0);
            } else if (e.key === "Enter") {
              // This box sits inside the menu form: Enter must never submit it. One match? choose it.
              e.preventDefault();
              if (shown.length === 1) onChoose(shown[0]);
            }
          }}
          aria-label="Search icons"
          placeholder="Search icons, e.g. chart or user"
          className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={onClose}
          className="flex-none rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Close
        </button>
      </div>

      {current && !isKnownIcon(current) && (
        <p className="mt-2 text-xs text-amber-700">
          Current value: <span className="font-mono">{current}</span> — not in this set, so it shows a ? here. Pick one below to
          replace it.
        </p>
      )}

      <div role="group" aria-label="Icons" onKeyDown={onGridKey} className="mt-2 max-h-72 overflow-auto">
        <div className="grid min-w-[34rem] grid-cols-6 gap-1.5">
          {items.map((name, i) => {
            const selected = name === current;
            const none = name === "";
            return (
              <button
                key={name || "none"}
                ref={(el) => {
                  cells.current[i] = el;
                }}
                type="button"
                tabIndex={i === tabStop ? 0 : -1}
                aria-pressed={none ? current === "" : selected}
                aria-label={none ? "None" : name}
                title={none ? "No icon" : name}
                onFocus={() => setActive(i)}
                onClick={() => onChoose(name)}
                className={`flex h-20 flex-col items-center justify-center gap-1 rounded-md border px-1 text-center hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  (none ? current === "" : selected) ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 text-gray-700"
                }`}
              >
                {none ? <span className="text-lg leading-none text-gray-400">∅</span> : <MenuIcon name={name} className="h-6 w-6" />}
                <span aria-hidden="true" className="w-full break-all text-[10px] leading-tight">
                  {none ? "None" : name.replace(/Icon$/, "")}
                </span>
              </button>
            );
          })}
        </div>
        {shown.length === 0 && <p className="py-4 text-center text-sm text-gray-500">No icons match “{query.trim()}”.</p>}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {shown.length} of {MENU_ICON_NAMES.length} icons · arrow keys move, Enter chooses, Esc closes
      </p>
    </div>
  );
}
