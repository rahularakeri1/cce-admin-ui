import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUploadProtocol } from "../hooks/useProtocols";
import { checkPlanDefinition, MAX_PROTOCOL_BYTES, readFileText } from "../lib/planDefinition";
import { classifyProtocolError } from "../lib/protocolErrors";

export default function ProtocolUploadPage() {
  const navigate = useNavigate();
  const upload = useUploadProtocol();
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  // Checked on every change, in the browser: nothing below can be sent until this says ok.
  const check = useMemo(() => (text.trim() === "" ? null : checkPlanDefinition(text)), [text]);
  const failure = upload.error ? classifyProtocolError(upload.error, "upload") : null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again must still fire onChange
    if (!file) return;
    upload.reset();
    if (file.size > MAX_PROTOCOL_BYTES) {
      setFileError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — a protocol is a few KB. Is it the right file?`);
      return;
    }
    setFileError(null);
    try {
      setText(await readFileText(file));
    } catch {
      setFileError("Could not read that file — try again, or paste the JSON instead.");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!check?.ok) return;
    const { url, version } = check.preview;
    upload.mutate(text, {
      onSuccess: () => navigate("/protocols", { state: { uploaded: `${url} ${version}` } }),
    });
  }

  return (
    <div>
      <Link to="/protocols" className="text-sm text-blue-700 hover:underline">
        ← Protocols
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">Upload protocol</h1>
      <p className="mt-1 text-sm text-gray-600">
        Pick a FHIR PlanDefinition <span className="font-mono">.json</span> file or paste it. It is checked here first; the
        protocol service then validates it fully. A new version is a new upload — the same url and version can't be loaded
        twice.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="protocol-file" className="block text-sm font-medium text-gray-800">
            File
          </label>
          <input
            id="protocol-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => void onFile(e)}
            disabled={upload.isPending}
            className="mt-1 block text-sm text-gray-700"
          />
          {fileError && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {fileError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="protocol-json" className="block text-sm font-medium text-gray-800">
            …or paste the JSON
          </label>
          <textarea
            id="protocol-json"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileError(null);
              upload.reset();
            }}
            disabled={upload.isPending}
            rows={12}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-gray-300 p-2 font-mono text-xs"
          />
          {check && !check.ok && (
            <p role="alert" className="mt-1 text-sm text-red-700">
              {check.error}
            </p>
          )}
        </div>

        {check?.ok && (
          <section aria-label="Preview" className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            <p className="font-medium">Looks like a valid PlanDefinition</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
              <dt className="text-green-800">URL</dt>
              <dd className="break-all font-mono text-xs">{check.preview.url}</dd>
              <dt className="text-green-800">Version</dt>
              <dd>{check.preview.version}</dd>
              {check.preview.title && (
                <>
                  <dt className="text-green-800">Title</dt>
                  <dd>{check.preview.title}</dd>
                </>
              )}
              <dt className="text-green-800">Actions</dt>
              <dd>{check.preview.actionCount}</dd>
            </dl>
          </section>
        )}

        {failure && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {failure.message}
          </p>
        )}

        <button
          type="submit"
          disabled={!check?.ok || upload.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {upload.isPending ? "Uploading…" : "Upload"}
        </button>
      </form>
    </div>
  );
}
