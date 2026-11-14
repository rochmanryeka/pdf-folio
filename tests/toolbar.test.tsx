import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { EditorToolbar } from "../src/components/EditorToolbar";
test("toolbar invokes PDF editing actions and disables undo without history", async () => {
  const rotate = vi.fn(),
    signature = vi.fn(),
    image = vi.fn(),
    zoom = vi.fn();
  render(
    <EditorToolbar
      ready
      canUndo={false}
      canRedo
      zoom={100}
      onUndo={() => {}}
      onRedo={() => {}}
      onRotate={rotate}
      onSignature={signature}
      onImage={image}
      onZoom={zoom}
      onFit={() => {}}
    />,
  );
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Rotate page 90°" }));
  expect(rotate).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Signature" }));
  expect(signature).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Add image" }));
  expect(image).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(zoom).toHaveBeenCalledWith(110);
});

test("shape tools arm without inserting an annotation and announce the active mode", async () => {
  const add = vi.fn();
  render(
    <EditorToolbar
      ready
      canUndo={false}
      canRedo={false}
      zoom={100}
      onUndo={() => {}}
      onRedo={() => {}}
      onRotate={() => {}}
      onSignature={() => {}}
      onImage={() => {}}
      onZoom={() => {}}
      onFit={() => {}}
      onAddAnnotation={add}
      activeTool="arrow"
    />,
  );
  expect(screen.getByRole("button", { name: "Add arrow" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Add rectangle" }));
  expect(add).toHaveBeenCalledWith("rectangle");
  expect(screen.getByRole("button", { name: "Add rectangle" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
