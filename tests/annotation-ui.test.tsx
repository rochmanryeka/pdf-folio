import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { EditorToolbar } from "../src/components/EditorToolbar";

test("annotation tools expose text, line, arrow, rectangle, circle, and highlight actions", async () => {
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
    />,
  );
  const user = userEvent.setup();
  for (const kind of [
    "text",
    "line",
    "arrow",
    "rectangle",
    "circle",
    "highlight",
  ]) {
    await user.click(
      screen.getByRole("button", { name: new RegExp(kind, "i") }),
    );
    expect(add).toHaveBeenLastCalledWith(kind);
  }
});
