import { expect, test } from "vitest";
import { createDrawingOverlay } from "../src/lib/drawing";

test("creates reverse-direction line endpoints in top-down normalized coordinates", () => {
  const overlay = createDrawingOverlay(
    "arrow",
    0,
    { x: 640, y: 750 },
    { x: 160, y: 250 },
    800,
    1000,
    "id",
  );
  expect(overlay).toMatchObject({
    x: 0.2,
    y: 0.25,
    width: 0.6,
    height: 0.5,
    start: { x: 1, y: 1 },
    end: { x: 0, y: 0 },
  });
});

test("keeps pure horizontal and vertical lines drawable with centered zero axis", () => {
  const horizontal = createDrawingOverlay(
    "line",
    0,
    { x: 70, y: 360 },
    { x: 560, y: 360 },
    700,
    900,
    "h",
  );
  const vertical = createDrawingOverlay(
    "line",
    0,
    { x: 210, y: 90 },
    { x: 210, y: 720 },
    700,
    900,
    "v",
  );
  expect(horizontal).toMatchObject({
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  });
  expect(vertical).toMatchObject({
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
  });
  expect(horizontal.height * 900).toBe(12);
  expect(vertical.width * 700).toBe(24);
});

test("bounds shapes within page and uses consistent defaults", () => {
  const overlay = createDrawingOverlay(
    "rectangle",
    2,
    { x: -10, y: 15 },
    { x: 60, y: 75 },
    500,
    600,
    "box",
  );
  expect(overlay).toMatchObject({
    pageIndex: 2,
    x: 0,
    y: 0.025,
    width: 0.12,
    height: 0.1,
    color: "#162c4d",
    fill: "none",
    strokeWidth: 2,
    opacity: 1,
  });
});
