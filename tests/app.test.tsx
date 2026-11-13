import { render, screen } from "@testing-library/react";
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
test("opens demo workspace and rotates selected page with undo and redo", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rotate page 90°" }));
  expect(screen.getByTestId("rotation-status")).toHaveTextContent("90°");
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.getByTestId("rotation-status")).toHaveTextContent("0°");
  await user.click(screen.getByRole("button", { name: "Redo" }));
  expect(screen.getByTestId("rotation-status")).toHaveTextContent("90°");
});
test("theme only changes through manual toggle", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const before = document.documentElement.dataset.theme;
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Toggle theme" }));
  expect(document.documentElement.dataset.theme).not.toBe(before);
});
