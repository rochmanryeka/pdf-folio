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
