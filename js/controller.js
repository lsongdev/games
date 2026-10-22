const KEY_BUTTONS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Enter: 'start', ShiftLeft: 'select', ShiftRight: 'select',
  KeyL: 'a', KeyK: 'b',
};

// NES games use digital directions. A small neutral zone prevents accidental
// movement, and the eight equal sectors allow a single thumb to hold diagonals.
function directionsAt(x, y, radius) {
  if (Math.hypot(x, y) < radius * 0.18) return [];
  const diagonal = Math.tan(Math.PI / 8);
  const buttons = [];
  if (Math.abs(x) > Math.abs(y) * diagonal) buttons.push(x < 0 ? 'left' : 'right');
  if (Math.abs(y) > Math.abs(x) * diagonal) buttons.push(y < 0 ? 'up' : 'down');
  return buttons;
}

export function bindController(root, onButtonChange) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const dpad = root.querySelector('.dpad');
  const elements = [...root.querySelectorAll('[data-btn]')];
  const sources = new Map();
  const pointers = new Map();
  const listeners = new AbortController();
  let pressed = new Set();
  let dpadPointer = null;

  function render() {
    const next = new Set([...sources.values()].flatMap(buttons => [...buttons]));
    for (const button of pressed) {
      if (!next.has(button)) onButtonChange(button, false);
    }
    for (const button of next) {
      if (!pressed.has(button)) onButtonChange(button, true);
    }
    pressed = next;
    for (const element of elements) {
      const down = pressed.has(element.dataset.btn);
      element.classList.toggle('pressed', down);
      if (element.tagName === 'BUTTON') element.setAttribute('aria-pressed', String(down));
    }
  }

  function setSource(source, buttons) {
    if (buttons.length) sources.set(source, new Set(buttons));
    else sources.delete(source);
    render();
  }

  function moveStick(event) {
    const rect = dpad.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    const travel = radius * 0.48;
    const scale = distance > travel ? travel / distance : 1;
    dpad.style.setProperty('--stick-x', `${x * scale}px`);
    dpad.style.setProperty('--stick-y', `${y * scale}px`);
    setSource(`pointer:${event.pointerId}`, directionsAt(x, y, radius));
  }

  function resetStick() {
    dpadPointer = null;
    dpad.classList.remove('engaged');
    dpad.style.removeProperty('--stick-x');
    dpad.style.removeProperty('--stick-y');
  }

  function releasePointer(pointerId) {
    const element = pointers.get(pointerId);
    if (!element) return;
    pointers.delete(pointerId);
    if (pointerId === dpadPointer) resetStick();
    setSource(`pointer:${pointerId}`, []);
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  }

  function reset() {
    sources.clear();
    render();
    for (const pointerId of [...pointers.keys()]) releasePointer(pointerId);
    resetStick();
  }

  const listen = (target, type, handler) => {
    target.addEventListener(type, handler, { signal: listeners.signal, passive: false });
  };

  listen(root, 'pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target.closest('.dpad, [data-btn]');
    if (!target || !root.contains(target)) return;
    event.preventDefault();
    const isDpad = dpad.contains(target);
    if (isDpad && dpadPointer !== null) return;
    const element = isDpad ? dpad : target;
    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, element);
    if (isDpad) {
      dpadPointer = event.pointerId;
      dpad.classList.add('engaged');
      moveStick(event);
    } else {
      setSource(`pointer:${event.pointerId}`, [element.dataset.btn]);
    }
  });

  listen(root, 'pointermove', event => {
    if (event.pointerId !== dpadPointer) return;
    event.preventDefault();
    moveStick(event);
  });

  // Capture keeps a held input alive outside its hit area. Every termination
  // path releases only that finger, leaving other fingers and keys untouched.
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(doc, type, event => releasePointer(event.pointerId));
  }

  for (const type of ['keydown', 'keyup']) {
    listen(doc, type, event => {
      const source = `key:${event.code}`;
      const focusedButton = event.target.closest?.('button[data-btn]');
      const button = focusedButton && root.contains(focusedButton) && ['Space', 'Enter'].includes(event.code)
        ? focusedButton.dataset.btn : KEY_BUTTONS[event.code];
      if (type === 'keyup' && sources.has(source)) {
        event.preventDefault();
        setSource(source, []);
        return;
      }
      if (!button) return;
      event.preventDefault();
      setSource(source, type === 'keydown' ? [button] : []);
    });
  }

  listen(root, 'contextmenu', event => event.preventDefault());
  listen(win, 'blur', reset);
  listen(win, 'pagehide', reset);
  listen(win, 'resize', reset);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });

  return () => {
    reset();
    listeners.abort();
  };
}
