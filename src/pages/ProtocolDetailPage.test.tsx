import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GATEWAY_403, GATEWAY_DOWN_500, mockDb } from "../mocks/handlers";
import { renderProtocols } from "../test-utils/protocols";

const retireButton = () => screen.queryByRole("button", { name: "Retire" });

describe("ProtocolDetailPage", () => {
  it("shows the stored definition as read-only formatted JSON, with the facts above it", async () => {
    renderProtocols("/protocols/p-1");

    expect(await screen.findByRole("heading", { name: /emr-service-protocol/ })).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText(/emr-service-protocol\|1\.0\.0/)).toBeInTheDocument();
    const json = screen.getByLabelText("Protocol definition JSON");
    expect(json.tagName).toBe("PRE");
    expect(json.textContent).toBe(JSON.stringify(mockDb.protocols[0].definition, null, 2));
  });

  describe("Copy", () => {
    // userEvent.setup() installs its own navigator.clipboard stub, so the spy goes on AFTER setup.
    afterEach(() => vi.restoreAllMocks());

    it("copies the formatted JSON and says so", async () => {
      renderProtocols("/protocols/p-1");
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
      await screen.findByLabelText("Protocol definition JSON");

      await user.click(screen.getByRole("button", { name: "Copy" }));

      expect(writeText).toHaveBeenCalledWith(JSON.stringify(mockDb.protocols[0].definition, null, 2));
      expect(await screen.findByText("Copied")).toBeInTheDocument();
    });

    it("says when the browser refuses, instead of pretending", async () => {
      renderProtocols("/protocols/p-1");
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
      await screen.findByLabelText("Protocol definition JSON");

      await user.click(screen.getByRole("button", { name: "Copy" }));

      expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
    });
  });

  describe("Retire", () => {
    it("asks first, in place, spelling out what retiring does — and Cancel changes nothing", async () => {
      renderProtocols("/protocols/p-1");
      const user = userEvent.setup();
      await screen.findByLabelText("Protocol definition JSON");

      await user.click(retireButton()!);
      const confirm = screen.getByRole("group", { name: "Confirm retire" });
      expect(confirm).toHaveTextContent(/stops matching new events.*already enrolled are not affected.*can't be undone/);

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("group", { name: "Confirm retire" })).not.toBeInTheDocument();
      expect(mockDb.protocols[0].status).toBe("ACTIVE");
    });

    it("retires on confirm and the page shows RETIRED from a real refetch, with no Retire button left", async () => {
      renderProtocols("/protocols/p-1");
      const user = userEvent.setup();
      await screen.findByLabelText("Protocol definition JSON");

      await user.click(retireButton()!);
      await user.click(screen.getByRole("button", { name: "Retire protocol" }));

      expect(await screen.findByText("RETIRED")).toBeInTheDocument();
      expect(mockDb.protocols[0].status).toBe("RETIRED");
      expect(retireButton()).not.toBeInTheDocument();
      expect(screen.getByText(/no longer matches new events/)).toBeInTheDocument();
    });

    it("offers no Retire for a protocol that is already retired", async () => {
      renderProtocols("/protocols/p-2");
      expect(await screen.findByText("RETIRED")).toBeInTheDocument();
      expect(retireButton()).not.toBeInTheDocument();
    });

    it("a 409 (someone retired it first) says so and the page refetches to show the truth", async () => {
      renderProtocols("/protocols/p-1");
      const user = userEvent.setup();
      await screen.findByLabelText("Protocol definition JSON");
      mockDb.protocols[0].status = "RETIRED"; // changed behind this page's back

      await user.click(retireButton()!);
      await user.click(screen.getByRole("button", { name: "Retire protocol" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("This protocol is already retired.");
      await waitFor(() => expect(screen.getByText("RETIRED")).toBeInTheDocument());
    });

    it("a gateway 403 says the role isn't allowed, and the protocol stays ACTIVE", async () => {
      renderProtocols("/protocols/p-1");
      const user = userEvent.setup();
      await screen.findByLabelText("Protocol definition JSON");

      await user.click(retireButton()!);
      mockDb.protocolFailNext = GATEWAY_403;
      await user.click(screen.getByRole("button", { name: "Retire protocol" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Your role isn't allowed to do this.");
      expect(mockDb.protocols[0].status).toBe("ACTIVE");
    });

    it("a down protocol service says nothing was changed", async () => {
      renderProtocols("/protocols/p-1");
      const user = userEvent.setup();
      await screen.findByLabelText("Protocol definition JSON");

      await user.click(retireButton()!);
      mockDb.protocolFailNext = GATEWAY_DOWN_500;
      await user.click(screen.getByRole("button", { name: "Retire protocol" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/Protocol service unavailable.*Nothing was changed/);
      expect(mockDb.protocols[0].status).toBe("ACTIVE");
    });
  });

  it("an unknown id says the protocol no longer exists", async () => {
    renderProtocols("/protocols/nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("This protocol no longer exists.");
    expect(screen.getByRole("link", { name: "← Protocols" })).toBeInTheDocument();
  });

  it("a gateway 403 on view says the role isn't allowed to view it", async () => {
    mockDb.protocolFailNext = GATEWAY_403;
    renderProtocols("/protocols/p-1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Your role isn't allowed to view this protocol.");
  });

  it("a down protocol service shows unavailable with Retry", async () => {
    mockDb.protocolFailNext = GATEWAY_DOWN_500;
    renderProtocols("/protocols/p-1");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Protocol service unavailable/);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Protocol definition JSON")).toBeInTheDocument();
  });
});
