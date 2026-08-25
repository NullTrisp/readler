import { clampZoomOffset, swipeDirection, zoomOffsetForTap } from '../zoom';

it('keeps zoomed-page panning inside the visible bounds', () => {
  expect(clampZoomOffset(20, 400, 1)).toBe(0);
  expect(clampZoomOffset(500, 400, 2)).toBe(200);
  expect(clampZoomOffset(-500, 400, 2)).toBe(-200);
});

it('keeps the double-tapped point fixed while zooming in', () => {
  expect(zoomOffsetForTap(200, 400, 2)).toBe(0);
  expect(zoomOffsetForTap(100, 400, 2)).toBe(100);
  expect(zoomOffsetForTap(400, 400, 2)).toBe(-200);
});

it('changes comic pages only for a deliberate horizontal swipe', () => {
  expect(swipeDirection(-70, -200, 400)).toBe(1);
  expect(swipeDirection(70, 200, 400)).toBe(-1);
  expect(swipeDirection(-30, -600, 400)).toBe(1);
  expect(swipeDirection(30, 600, 400)).toBe(-1);
  expect(swipeDirection(30, 200, 400)).toBe(0);
});
