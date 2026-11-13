import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SignatureDialog } from "../src/components/SignatureDialog";
test("typed signature requires a name and inserts transparent image", async () => {
  const add = vi.fn();
  render(<SignatureDialog open onOpenChange={() => {}} onAdd={add} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Type name" }));
  expect(screen.getByRole("button", { name: "Use signature" })).toBeDisabled();
  await user.type(screen.getByLabelText("Full name"), "Rochman");
  expect(screen.getByRole("button", { name: "Use signature" })).toBeEnabled();
});
test("signature dialog can be dismissed via Escape", async () => {
  const close = vi.fn();
  render(<SignatureDialog open onOpenChange={close} onAdd={() => {}} />);
  await userEvent.setup().keyboard("{Escape}");
  expect(close).toHaveBeenCalledWith(false);
});
