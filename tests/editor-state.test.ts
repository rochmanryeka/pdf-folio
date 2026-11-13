import { describe, expect, it } from "vitest";
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
  type EditState,
} from "../src/lib/editor-state";

const state = (rotation: number): EditState => ({
  rotations: [rotation],
  overlays: [],
});

describe("editor history", () => {
  it("creates an independent empty history around the initial state", () => {
    const initial = state(0);
    const history = createHistory(initial);
    expect(history).toEqual({ past: [], present: initial, future: [] });
    expect(history.present).not.toBe(initial);
    expect(history.present.rotations).not.toBe(initial.rotations);
  });

  it("commits, undoes, and redoes immutable snapshots", () => {
    const first = createHistory(state(0));
    const second = commitHistory(first, state(90));
    expect(second.present.rotations).toEqual([90]);
    expect(undoHistory(second).present.rotations).toEqual([0]);
    expect(redoHistory(undoHistory(second)).present.rotations).toEqual([90]);
    expect(first.present.rotations).toEqual([0]);
  });

  it("does not record identical snapshots", () => {
    const initial = createHistory(state(0));
    expect(commitHistory(initial, state(0))).toEqual(initial);
  });

  it("limits undo history to the most recent 50 states", () => {
    let history = createHistory(state(0));
    for (let rotation = 1; rotation <= 60; rotation += 1) {
      history = commitHistory(history, state(rotation));
    }
    expect(history.past).toHaveLength(50);
    for (let count = 0; count < 50; count += 1) history = undoHistory(history);
    expect(history.present.rotations).toEqual([10]);
    expect(undoHistory(history)).toEqual(history);
  });
});
