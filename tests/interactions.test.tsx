import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
vi.mock("../src/lib/pdf-engine", () => ({
  inspectPdf: async () => [{ width: 595, height: 842, rotation: 0 }],
  createDemoPdf: async () => new Uint8Array([1]),
  exportPdf: vi.fn(),
  measureTextOverlay: async (overlay: { text: string }, width: number) => ({
    lines: [overlay.text],
    padding: 6,
    requiredHeight:
      35 +
      (overlay.text.match(/\n/g)?.length ?? 0) * 20 +
      overlay.text.length / width,
    lineHeight: 20,
    fontSize: 18,
    ascender: 14,
  }),
}));
vi.mock("../src/components/PdfCanvas", () => ({
  PdfCanvas: () => <canvas aria-label="PDF page" />,
}));
import App from "../src/App";
import { OverlayVisual } from "../src/components/OverlayVisual";

test("drawing commits one shape only after a drag and ignores a click", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const stage = document.querySelector(".page-stage") as HTMLDivElement;
  stage.setPointerCapture = vi.fn();
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 595,
    bottom: 842,
    width: 595,
    height: 842,
    toJSON: () => ({}),
  });
  const user = (await import("@testing-library/user-event")).default.setup();
  const undo = screen.getByRole("button", { name: "Undo" });
  await user.click(screen.getByRole("button", { name: "Add rectangle" }));
  expect(undo).toBeDisabled();
  fireEvent.pointerDown(stage, {
    button: 0,
    pointerId: 1,
    clientX: 20,
    clientY: 30,
  });
  fireEvent.pointerMove(stage, { pointerId: 1, clientX: 120, clientY: 130 });
  expect(document.querySelector(".drawing-preview")).toBeInTheDocument();
  fireEvent.pointerUp(stage, {
    button: 0,
    pointerId: 1,
    clientX: 120,
    clientY: 130,
  });
  await waitFor(() => expect(undo).toBeEnabled());
  expect(document.querySelectorAll(".pdf-object")).toHaveLength(1);

  await user.click(screen.getByRole("button", { name: "Add circle" }));
  fireEvent.pointerDown(stage, {
    button: 0,
    pointerId: 2,
    clientX: 20,
    clientY: 30,
  });
  fireEvent.pointerUp(stage, {
    button: 0,
    pointerId: 2,
    clientX: 21,
    clientY: 30,
  });
  expect(document.querySelectorAll(".pdf-object")).toHaveLength(1);
});

test("Escape cancels an armed drawing tool without adding history", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  await (
    await import("@testing-library/user-event")
  ).default
    .setup()
    .click(screen.getByRole("button", { name: "Add arrow" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Add arrow" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("blank-page context menu can add text", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const stage = document.querySelector(".context-menu-area") as HTMLDivElement;
  fireEvent.contextMenu(stage, { button: 2, clientX: 30, clientY: 40 });
  const addText = await screen.findByRole("menuitem", { name: "Add text" });
  await (
    await import("@testing-library/user-event")
  ).default
    .setup()
    .click(addText);
  expect(
    await screen.findByRole("heading", { name: "Add text" }),
  ).toBeInTheDocument();
});

test("right-click selects that object and the app menu deletes it", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const stage = document.querySelector(".page-stage") as HTMLDivElement;
  stage.setPointerCapture = vi.fn();
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 595,
    bottom: 842,
    width: 595,
    height: 842,
    toJSON: () => ({}),
  });
  const user = (await import("@testing-library/user-event")).default.setup();
  await user.click(screen.getByRole("button", { name: "Add rectangle" }));
  fireEvent.pointerDown(stage, {
    button: 0,
    pointerId: 3,
    clientX: 30,
    clientY: 40,
  });
  fireEvent.pointerUp(stage, {
    button: 0,
    pointerId: 3,
    clientX: 90,
    clientY: 100,
  });
  const hit = document.querySelector(".object-hit") as HTMLButtonElement;
  fireEvent.contextMenu(hit, { button: 2, clientX: 40, clientY: 50 });
  expect(hit.parentElement).toHaveClass("is-selected");
  const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });
  expect(deleteItem).not.toBeDisabled();
  await user.click(deleteItem);
  await waitFor(() =>
    expect(document.querySelectorAll(".pdf-object")).toHaveLength(0),
  );
});

test("right-clicking the workspace outside the PDF also uses the app menu", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  fireEvent.contextMenu(document.querySelector(".workspace")!, {
    button: 2,
    clientX: 30,
    clientY: 40,
  });
  expect(
    await screen.findByRole("menuitem", { name: "Add text" }),
  ).toBeInTheDocument();
});

test("new multiline text uses measured height before it is inserted", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const user = (await import("@testing-library/user-event")).default.setup();
  await user.click(screen.getByRole("button", { name: "Add text" }));
  await user.type(
    screen.getByLabelText("Text content"),
    "first line{enter}second line{enter}third line",
  );
  const buttons = screen.getAllByRole("button", { name: "Add text" });
  await user.click(buttons[buttons.length - 1]);
  const object = await screen.findByLabelText("Select text");
  expect(
    Number.parseFloat((object.parentElement as HTMLElement).style.height),
  ).toBeGreaterThan(60);
});

test("preview arrow follows stored reverse endpoints", () => {
  const { container } = render(
    <OverlayVisual
      overlay={{
        id: "a",
        pageIndex: 0,
        kind: "arrow",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        start: { x: 1, y: 1 },
        end: { x: 0, y: 0 },
      }}
      width={100}
      height={80}
    />,
  );
  const line = container.querySelector("svg line");
  expect(line).toHaveAttribute("x1", "100");
  expect(line).toHaveAttribute("y1", "80");
  expect(line).toHaveAttribute("x2", "0");
  expect(line).toHaveAttribute("y2", "0");
});

test("Shift+F10 opens the focused app context menu", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const trigger = screen.getByLabelText("PDF page editor");
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "F10", shiftKey: true });
  expect(
    await screen.findByRole("menuitem", { name: "Add text" }),
  ).toBeInTheDocument();
  await (
    await import("@testing-library/user-event")
  ).default
    .setup()
    .keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("menuitem", { name: "Add text" })).toBeNull(),
  );
  expect(document.activeElement).toBe(trigger);
});

test("keyboard context menu retains the focused text annotation as its target", async () => {
  render(<App />);
  await screen.findByText("Partnership proposal.pdf");
  const user = (await import("@testing-library/user-event")).default.setup();
  await user.click(screen.getByRole("button", { name: "Add text" }));
  await user.type(screen.getByLabelText("Text content"), "Keyboard target");
  const submit = screen.getAllByRole("button", { name: "Add text" }).at(-1)!;
  await user.click(submit);
  const target = await screen.findByLabelText("Select text");
  target.focus();
  fireEvent.keyDown(target, { key: "F10", shiftKey: true });
  expect(
    await screen.findByRole("menuitem", { name: "Edit text" }),
  ).toBeInTheDocument();
});
