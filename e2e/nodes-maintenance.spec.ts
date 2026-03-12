import { expect, test, type APIRequestContext } from "@playwright/test";

const operatorToken = "e2e-operator-token";

async function loginWithToken(request: APIRequestContext, token: string) {
  const response = await request.post("/api/auth/login", { data: { token } });
  expect(response.status()).toBe(200);
}

test("maintenance flow blocks operator force drain on protected node", async ({ page }) => {
  await loginWithToken(page.request, operatorToken);

  await page.goto("/");
  const search = page.getByPlaceholder("search views (/)");
  await search.fill("nodes");
  await page.getByRole("button", { name: "Execute search" }).click();
  await expect(page.getByRole("heading", { name: "Nodes" })).toBeVisible();

  const masterRow = page.locator("tr", { hasText: "node-master-1" }).first();
  await masterRow.getByRole("button", { name: "Details" }).click();

  const modal = page.locator("div.fixed.inset-0").first();
  await expect(modal.getByRole("heading", { name: "node-master-1" })).toBeVisible();
  await modal.getByRole("button", { name: "Maintenance" }).click();
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") {
      await dialog.accept("E2E: force drain validation");
      return;
    }
    await dialog.accept();
  });
  await modal.getByRole("button", { name: "Cordon", exact: true }).click();
  await modal.getByRole("button", { name: "Preview Drain" }).click();
  await expect(modal.getByRole("button", { name: "Force Drain" })).toBeVisible();
  await modal.getByRole("button", { name: "Force Drain" }).click();

  await expect(page.getByText("force drain requires admin role")).toBeVisible();
});
