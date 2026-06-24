import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedPreviewApiPath } from "../../src/lib/artifact-preview-bridge";

const projectId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";

describe("preview API path allowlist", () => {
  it("allows project app-data paths", () => {
    assert.equal(
      isAllowedPreviewApiPath(`/api/v1/projects/${projectId}/data/todos`, { projectId }),
      true,
    );
  });

  it("allows installation actions", () => {
    assert.equal(
      isAllowedPreviewApiPath(
        `/api/v1/installations/${installationId}/actions/swap`,
        { installationId },
      ),
      true,
    );
  });

  it("rejects auth routes", () => {
    assert.equal(isAllowedPreviewApiPath("/api/v1/auth/me", { projectId }), false);
  });

  it("rejects proxy route", () => {
    assert.equal(isAllowedPreviewApiPath("/api/v1/proxy", { projectId }), false);
  });

  it("rejects mismatched project id", () => {
    assert.equal(
      isAllowedPreviewApiPath(
        `/api/v1/projects/${projectId}/data/todos`,
        { projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ),
      false,
    );
  });

  it("allows session-scoped data routes", () => {
    assert.equal(
      isAllowedPreviewApiPath(`/api/v1/chat/sessions/${sessionId}/data/todos`, {
        sessionId,
      }),
      true,
    );
  });
});
