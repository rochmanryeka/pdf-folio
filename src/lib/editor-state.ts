import type { Overlay } from "./overlay-types";
export type { Overlay, OverlayKind } from "./overlay-types";

export type EditState = { rotations: number[]; overlays: Overlay[] };
export type History = {
  past: EditState[];
  present: EditState;
  future: EditState[];
};

const copyState = (state: EditState): EditState => ({
  rotations: [...state.rotations],
  overlays: state.overlays.map((overlay) => ({ ...overlay })),
});

const equalState = (left: EditState, right: EditState): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export function createHistory(state: EditState): History {
  return { past: [], present: copyState(state), future: [] };
}

export function commitHistory(history: History, next: EditState): History {
  const snapshot = copyState(next);
  if (equalState(history.present, snapshot)) return history;
  return {
    past: [...history.past.slice(-49), copyState(history.present)],
    present: snapshot,
    future: [],
  };
}

export function undoHistory(history: History): History {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: copyState(previous),
    future: [copyState(history.present), ...history.future],
  };
}

export function redoHistory(history: History): History {
  if (!history.future.length) return history;
  const next = history.future[0];
  return {
    past: [...history.past.slice(-49), copyState(history.present)],
    present: copyState(next),
    future: history.future.slice(1),
  };
}
