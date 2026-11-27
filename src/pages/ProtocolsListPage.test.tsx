import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GATEWAY_403, GATEWAY_DOWN_500, mockDb } from "../mocks/handlers";
import { renderProtocols } from "../test-utils/protocols";

describe("ProtocolsListPage", () => {
  it("lists url, version, status and loaded-at, newest first, each url linking to its detail", async () => {
    renderProtocols("/protocols");

    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2
    const first = within(rows[1]);
    expect(first.getByRole("link", { name: /emr-service-protocol/ })).toHaveAttribute("href", "/protocols/p-1");
    expect(first.getByText("1.0.0")).toBeInTheDocument();
    expect(first.getByText("ACTIVE")).toBeInTheDocument();
    expect(first.getByText("2026-10-26", { exact: false })).toBeInTheDocument();
    const second = within(rows[2]);
    expect(second.getByRole("link", { name: /PlanDefinition\/anc/ })).toBeInTheDocument();
    expect(second.getByText("RETIRED")).toBeInTheDocument();
    expect(screen.getByText(/2 protocols/)).toBeInTheDocument();
  });

  it("offers Upload protocol", async () => {
    renderProtocols("/protocols");
    expect(await screen.findByRole("link", { name: "+ Upload protocol" })).toHaveAttribute("href", "/protocols/new");
  });

  it("pages on the server: 25 protocols are two pages of 20 and 5", async () => {
    for (let i = 3; i <= 25; i++) {
      mockDb.protocols.push({
        id: `p-${i}`, url: `http://x/pd-${i}`, version: "1", canonical: "", status: "ACTIVE",
        loadedAt: `2026-11-${String(i).padStart(2, "0")}T00:00:00Z`, definition: {},
      });
    }
    renderProtocols("/protocols");
    const user = userEvent.setup();

    expect(await screen.findByText(/25 protocols · page 1 of 2/)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/page 2 of 2/)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("says so when nothing is loaded yet", async () => {
    mockDb.protocols = [];
    renderProtocols("/protocols");
    expect(await screen.findByText(/No protocols are loaded yet/)).toBeInTheDocument();
  });

  it("a gateway 403 says the role isn't allowed — and offers no Retry, it would not help", async () => {
    mockDb.protocolFailNext = GATEWAY_403;
    renderProtocols("/protocols");
    expect(await screen.findByRole("alert")).toHaveTextContent("Your role isn't allowed to view protocols.");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("a down protocol service (the gateway's bare 500) says unavailable, and Retry recovers", async () => {
    mockDb.protocolFailNext = GATEWAY_DOWN_500;
    renderProtocols("/protocols");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Protocol service unavailable/);

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
