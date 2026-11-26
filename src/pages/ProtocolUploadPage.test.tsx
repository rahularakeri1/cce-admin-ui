import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { GATEWAY_403, GATEWAY_DOWN_500, mockDb } from "../mocks/handlers";
import { planDefinitionText, renderProtocols } from "../test-utils/protocols";

const uploadButton = () => screen.getByRole("button", { name: /^(Upload|Uploading…)$/ });
const textarea = () => screen.getByLabelText(/paste the JSON/i);

// userEvent.type would treat "{" and "[" as key syntax, so text is set the way a paste sets it.
const paste = (text: string) => fireEvent.change(textarea(), { target: { value: text } });
const jsonFile = (text: string, name = "protocol.json") => new File([text], name, { type: "application/json" });

describe("ProtocolUploadPage — browser-side checks", () => {
  it("starts with Upload disabled and nothing said", () => {
    renderProtocols("/protocols/new");
    expect(uploadButton()).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("text that isn't JSON is explained and can never be sent", async () => {
    renderProtocols("/protocols/new");
    paste("{ not json");

    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't valid JSON/);
    expect(uploadButton()).toBeDisabled();
    expect(mockDb.protocolUploadCalls).toBe(0);
  });

  it("valid JSON that isn't a PlanDefinition is refused before any request", async () => {
    renderProtocols("/protocols/new");
    paste(JSON.stringify({ resourceType: "Bundle", url: "u", version: "1" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/"PlanDefinition".*"Bundle"/);
    expect(uploadButton()).toBeDisabled();
    expect(mockDb.protocolUploadCalls).toBe(0);
  });

  it("a PlanDefinition with no version is refused before any request", async () => {
    renderProtocols("/protocols/new");
    paste(planDefinitionText({ version: undefined }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no "version"/);
    expect(uploadButton()).toBeDisabled();
    expect(mockDb.protocolUploadCalls).toBe(0);
  });

  it("a valid PlanDefinition shows a preview of url, version and number of actions, and enables Upload", async () => {
    renderProtocols("/protocols/new");
    paste(planDefinitionText());

    const preview = within(await screen.findByRole("region", { name: "Preview" }));
    expect(preview.getByText("http://openphc.org/PlanDefinition/new-protocol")).toBeInTheDocument();
    expect(preview.getByText("1.0.0")).toBeInTheDocument();
    expect(preview.getByText("A new protocol")).toBeInTheDocument();
    expect(preview.getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(uploadButton()).toBeEnabled();
  });
});

describe("ProtocolUploadPage — file picker", () => {
  it("fills the box from a picked .json file, then previews it", async () => {
    renderProtocols("/protocols/new");
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText("File"), jsonFile(planDefinitionText({ version: "2.0.0" })));

    expect(await screen.findByRole("region", { name: "Preview" })).toHaveTextContent("2.0.0");
    expect((textarea() as HTMLTextAreaElement).value).toContain('"version": "2.0.0"');
    expect(uploadButton()).toBeEnabled();
  });

  it("a broken file never reaches the server", async () => {
    renderProtocols("/protocols/new");
    const user = userEvent.setup();

    await user.upload(screen.getByLabelText("File"), jsonFile("{ this is broken"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't valid JSON/);
    expect(uploadButton()).toBeDisabled();
    expect(mockDb.protocolUploadCalls).toBe(0);
  });

  it("a far-too-large file is refused without being read", async () => {
    renderProtocols("/protocols/new");
    const big = jsonFile("{}");
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });

    fireEvent.change(screen.getByLabelText("File"), { target: { files: [big] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/6\.0 MB.*right file/);
    expect(textarea()).toHaveValue("");
    expect(uploadButton()).toBeDisabled();
  });
});

describe("ProtocolUploadPage — upload", () => {
  async function pasteAndUpload(text = planDefinitionText()) {
    renderProtocols("/protocols/new");
    const user = userEvent.setup();
    paste(text);
    await screen.findByRole("region", { name: "Preview" });
    await user.click(uploadButton());
    return user;
  }

  it("sends the PlanDefinition as a string in { planDefinitionJson }, then lands on the list showing it ACTIVE", async () => {
    const text = planDefinitionText();
    await pasteAndUpload(text);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Uploaded http://openphc.org/PlanDefinition/new-protocol 1.0.0. It is ACTIVE and matching new events.",
    );
    expect(mockDb.lastProtocolUpload).toEqual({ planDefinitionJson: text });
    expect(typeof mockDb.lastProtocolUpload?.planDefinitionJson).toBe("string");
    // The list refetched: the new protocol is in it, newest first. (The status shows the moment the list
    // mounts, before its table has loaded, so wait for the rows.)
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByRole("link", { name: /new-protocol/ })).toBeInTheDocument();
    expect(within(rows[1]).getByText("ACTIVE")).toBeInTheDocument();
  });

  it("uploading the same url and version again says it is already loaded and keeps the text", async () => {
    const text = planDefinitionText({
      url: "http://openphc.org/PlanDefinition/emr-service-protocol",
      version: "1.0.0",
    });
    await pasteAndUpload(text);

    expect(await screen.findByRole("alert")).toHaveTextContent(/already loaded.*change the version.*retire the old one/);
    expect(textarea()).toHaveValue(text);
    expect(mockDb.protocols).toHaveLength(2); // nothing was added
    expect(screen.getByRole("heading", { name: "Upload protocol" })).toBeInTheDocument(); // stayed on the page
  });

  it("shows the protocol service's own reason when it rejects the content", async () => {
    mockDb.protocolFailNext = {
      status: 422,
      body: { status: 422, error: "Unprocessable Entity", message: "Action ids must be unique: a1" },
    };
    await pasteAndUpload();

    expect(await screen.findByRole("alert")).toHaveTextContent("Action ids must be unique: a1");
  });

  it("a gateway 403 says the role isn't allowed to do this", async () => {
    mockDb.protocolFailNext = GATEWAY_403;
    await pasteAndUpload();

    expect(await screen.findByRole("alert")).toHaveTextContent("Your role isn't allowed to do this.");
    expect(mockDb.protocols).toHaveLength(2);
  });

  it("a down protocol service says unavailable and that nothing was uploaded, and the same text can be retried", async () => {
    mockDb.protocolFailNext = GATEWAY_DOWN_500;
    const user = await pasteAndUpload();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Protocol service unavailable.*Nothing was uploaded/);
    expect(uploadButton()).toBeEnabled();

    await user.click(uploadButton()); // service is back (the staged failure was one-shot)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Uploaded/));
    expect(mockDb.protocols).toHaveLength(3);
  });

  it("disables the form while the upload is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post("*/v1/protocol/protocol-definitions", async () => {
        await gate;
        return HttpResponse.json({ error: "x" }, { status: 400 });
      }),
    );
    renderProtocols("/protocols/new");
    const user = userEvent.setup();
    paste(planDefinitionText());
    await screen.findByRole("region", { name: "Preview" });

    await user.click(uploadButton());

    expect(await screen.findByRole("button", { name: "Uploading…" })).toBeDisabled();
    expect(textarea()).toBeDisabled();
    expect(screen.getByLabelText("File")).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
  });
});
