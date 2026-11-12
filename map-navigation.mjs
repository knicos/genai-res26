export function attachMapNavigation(svg, viewport, controls) {
  let zoom = 1;
  let x = 0;
  let y = 0;
  let drag = null;
  let suppressClick = false;
  const update = () => {
    x = Math.max(900 * (1 - zoom), Math.min(0, x));
    y = Math.max(440 * (1 - zoom), Math.min(0, y));
    viewport.setAttribute("transform", `translate(${x} ${y}) scale(${zoom})`);
    controls.querySelector("output").textContent = `${Math.round(zoom * 100)}%`;
    controls.querySelector('[data-action="in"]').disabled = zoom >= 8;
    controls.querySelector('[data-action="out"]').disabled = zoom <= 1;
    svg.dataset.zoom = zoom;
  };
  const position = event => {
    const point = new DOMPoint(event.clientX, event.clientY);
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };
  const zoomAt = (factor, point = { x: 450, y: 220 }) => {
    const next = Math.max(1, Math.min(8, zoom * factor));
    x = point.x - (point.x - x) * next / zoom;
    y = point.y - (point.y - y) * next / zoom;
    zoom = next;
    update();
  };
  controls.querySelector('[data-action="in"]').addEventListener("click", () => zoomAt(1.4));
  controls.querySelector('[data-action="out"]').addEventListener("click", () => zoomAt(1 / 1.4));
  controls.querySelector('[data-action="reset"]').addEventListener("click", () => { zoom = 1; x = 0; y = 0; update(); });
  svg.addEventListener("wheel", event => {
    // Require a modifier so ordinary page scrolling is not captured.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomAt(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .005), position(event));
  }, { passive: false });
  svg.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    suppressClick = false;
    const point = position(event);
    drag = { id: event.pointerId, point, x, y, clientX: event.clientX, clientY: event.clientY, moved: false };
  });
  svg.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) > 4) {
      drag.moved = true;
      if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    const point = position(event);
    x = drag.x + point.x - drag.point.x;
    y = drag.y + point.y - drag.point.y;
    update();
  });
  const endDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    drag = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("lostpointercapture", event => { if (event.target === svg) drag = null; });
  svg.addEventListener("click", event => {
    if (suppressClick) { event.stopImmediatePropagation(); event.preventDefault(); suppressClick = false; }
  }, true);
  svg.addEventListener("keydown", event => {
    if (event.target !== svg) return;
    if (event.key === "+" || event.key === "=") zoomAt(1.4);
    else if (event.key === "-") zoomAt(1 / 1.4);
    else if (event.key === "0") { zoom = 1; x = 0; y = 0; update(); }
    else {
      const direction = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
      if (!direction) return;
      x += direction[0]; y += direction[1]; update();
    }
    event.preventDefault();
  });
  update();
  return {
    reveal(cx, cy) {
      if (cx * zoom + x < 20 || cx * zoom + x > 880 || cy * zoom + y < 20 || cy * zoom + y > 420) {
        x = 450 - cx * zoom; y = 220 - cy * zoom; update();
      }
    },
  };
}
