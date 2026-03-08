import { expect, test } from "@playwright/test";

test("dashboard loads and navigates between core views", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Cluster Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cluster Command Deck" })).toBeVisible();

  const search = page.getByPlaceholder("Search views ( / )");
  await search.fill("pods");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("heading", { name: "Pods" })).toBeVisible();
  await expect(page.getByText("kubectl get pods -A")).toBeVisible();

  await search.fill("diagnostics");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
  await expect(page.getByText("kubectl describe nodes")).toBeVisible();

  await search.fill("predictions");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByRole("heading", { name: "Predictions" })).toBeVisible();
  await expect(page.getByText("kubectl get events -A --sort-by=.metadata.creationTimestamp")).toBeVisible();
});
