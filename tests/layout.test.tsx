import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

vi.mock("../src/lib/pdf-engine", () => ({
  inspectPdf: async () => [{ width: 595, height: 842, rotation: 0 }],
  createDemoPdf: async () => new Uint8Array([1]),
  exportPdf: vi.fn(),
}));
vi.mock("../src/components/PdfCanvas", () => ({
  PdfCanvas: () => <canvas aria-label="PDF page" />,
}));
import App from "../src/App";

test("keeps document details in the pages panel and file actions in the global header", async () => {
  render(<App />);
  await screen.findByRole("heading", {
    level: 1,
    name: "Partnership proposal.pdf",
  });

  expect(document.querySelector(".document-header")).toBeNull();
  expect(document.querySelector(".tools-panel .tool-card")).toBeNull();
  const panel = document.querySelector(".pages-panel");
  expect(panel).not.toBeNull();
  expect(within(panel as HTMLElement).getByText("1 pages")).toBeTruthy();
  expect(within(panel as HTMLElement).getByText("Demo document")).toBeTruthy();
  expect(within(panel as HTMLElement).getByText("Ready to edit")).toBeTruthy();
  expect(within(panel as HTMLElement).queryByRole("button", { name: "Open PDF" })).toBeNull();
  expect(within(panel as HTMLElement).queryByRole("button", { name: "Download PDF" })).toBeNull();
  expect(document.querySelector(".document-actions")).toBeNull();
  const header = document.querySelector(".app-header .header-actions");
  expect(header).not.toBeNull();
  expect(within(header as HTMLElement).getAllByRole("button", { name: "Open PDF" })).toHaveLength(1);
  expect(within(header as HTMLElement).getAllByRole("button", { name: "Download PDF" })).toHaveLength(1);
  expect((within(header as HTMLElement).getByRole("button", { name: "Open PDF" }) as HTMLButtonElement).disabled).toBe(false);
  expect((within(header as HTMLElement).getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(false);
});

test("keeps the single header open and download actions available when the sidebar is closed", async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  await user.click(screen.getByRole("button", { name: "Close panel" }));

  expect(document.querySelector(".pages-panel")).toBeNull();
  expect(
    screen
      .getByRole("heading", { level: 1, name: "Partnership proposal.pdf" })
      .classList.contains("sr-only"),
  ).toBe(true);
  const header = document.querySelector(".app-header .header-actions");
  expect(within(header as HTMLElement).getAllByRole("button", { name: "Open PDF" })).toHaveLength(1);
  expect(within(header as HTMLElement).getAllByRole("button", { name: "Download PDF" })).toHaveLength(1);
  expect(document.querySelector(".icon-rail [aria-label='Open PDF']")).toBeNull();
  expect(document.querySelector(".icon-rail [aria-label='Download PDF']")).toBeNull();
});

test("updates the studio version and mobile pages panel starts below the global header", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  expect(screen.getByText("v1.3.0")).toBeTruthy();
});
