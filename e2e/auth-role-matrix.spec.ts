import { expect, test, type APIRequestContext } from "@playwright/test";

const viewerToken = "e2e-viewer-token";
const operatorToken = "e2e-operator-token";
const adminToken = "e2e-admin-token";

async function loginWithToken(request: APIRequestContext, token: string) {
  const response = await request.post("/api/auth/login", { data: { token } });
  expect(response.status()).toBe(200);
}

async function logoutSession(request: APIRequestContext) {
  const response = await request.post("/api/auth/logout", { data: {} });
  expect(response.status()).toBe(200);
}

test("auth role matrix and policy gates", async ({ page }) => {
  const request = page.request;

  await loginWithToken(request, viewerToken);
  let session = await request.get("/api/auth/session");
  expect(session.status()).toBe(200);
  let sessionPayload = await session.json();
  expect(sessionPayload.user.role).toBe("viewer");

  const viewerWrite = await request.post("/api/pods", {
    headers: { Authorization: `Bearer ${viewerToken}` },
    data: { namespace: "default", name: "e2e-viewer-attempt", image: "nginx:latest" },
  });
  expect(viewerWrite.status()).toBe(403);

  const viewerTerminal = await request.post("/api/terminal/exec", {
    headers: { Authorization: `Bearer ${viewerToken}` },
    data: { command: "kubectl get pods -A" },
  });
  expect(viewerTerminal.status()).toBe(403);
  await logoutSession(request);

  await loginWithToken(request, operatorToken);
  session = await request.get("/api/auth/session");
  sessionPayload = await session.json();
  expect(sessionPayload.user.role).toBe("operator");

  const operatorWrite = await request.post("/api/pods", {
    headers: { Authorization: `Bearer ${operatorToken}` },
    data: { namespace: "default", name: "e2e-operator-write", image: "nginx:latest" },
  });
  expect(operatorWrite.status()).toBe(200);
  const operatorWritePayload = await operatorWrite.json();
  expect(operatorWritePayload.success).toBe(true);

  const operatorTerminal = await request.post("/api/terminal/exec", {
    headers: { Authorization: `Bearer ${operatorToken}` },
    data: { command: "kubectl get pods -A" },
  });
  expect(operatorTerminal.status()).toBe(403);
  await logoutSession(request);

  await loginWithToken(request, adminToken);
  session = await request.get("/api/auth/session");
  sessionPayload = await session.json();
  expect(sessionPayload.user.role).toBe("admin");

  const csrfBlocked = await request.post("/api/pods", {
    headers: { Origin: "https://evil.example" },
    data: { namespace: "default", name: "csrf-block", image: "nginx:latest" },
  });
  expect(csrfBlocked.status()).toBe(403);

  const adminTerminal = await request.post("/api/terminal/exec", {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { command: "kubectl get pods -A" },
  });
  expect(adminTerminal.status()).toBe(200);
  const adminTerminalPayload = await adminTerminal.json();
  expect(typeof adminTerminalPayload.exitCode).toBe("number");
  await logoutSession(request);
});
