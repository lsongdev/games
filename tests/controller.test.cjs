const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const { chromium, webkit } = require('playwright');

const root = resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let server, origin;
const browsers = {};

before(async () => {
  server = createServer(async (req, res) => {
    const path = resolve(root, `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browsers.chromium = await chromium.launch();
  browsers.webkit = await webkit.launch();
});

after(async () => {
  await Promise.all(Object.values(browsers).map(browser => browser.close()));
  if (server) await new Promise(done => server.close(done));
});

async function player(t, engine, { width = 390, height = 844 } = {}) {
  const context = await browsers[engine].newContext({
    viewport: { width, height }, isMobile: true, hasTouch: true,
  });
  t.after(() => context.close());
  const page = await context.newPage();
  // The player styles are self-contained; keep tests independent of the
  // external site's styles, fonts and favicon availability.
  await page.route('https://lsong.org/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/js/player.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `import { bindController } from './controller.js';
      window.inputEvents = [];
      window.activeButtons = new Set();
      window.unbindController = bindController(document.querySelector('.controller'), (button, down) => {
        window.inputEvents.push([button, down]);
        if (down) window.activeButtons.add(button); else window.activeButtons.delete(button);
      });
      document.querySelector('#loading').classList.add('hidden');`,
  }));
  await page.goto(`${origin}/player.html?game=battle-city`);
  await page.locator('#loading').waitFor({ state: 'hidden' });
  return page;
}

async function active(page, expected) {
  assert.deepEqual(await page.evaluate(() => [...window.activeButtons].sort()), [...expected].sort());
}

async function center(page, selector) {
  const { x, y, width, height } = await page.locator(selector).boundingBox();
  return { x: x + width / 2, y: y + height / 2 };
}

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: continuous eight-way drag, neutral zone, capture and recenter`, async t => {
    const page = await player(t, engine);
    const { x, y } = await center(page, '.dpad');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await active(page, []);
    await page.mouse.move(x + 4, y + 3);
    await active(page, []);
    for (const [dx, dy, buttons] of [
      [40, 0, ['right']], [40, 40, ['right', 'down']], [0, 40, ['down']],
      [-40, 40, ['left', 'down']], [-40, 0, ['left']], [-40, -40, ['left', 'up']],
      [0, -40, ['up']], [40, -40, ['right', 'up']],
    ]) {
      await page.mouse.move(x + dx, y + dy);
      await active(page, buttons);
    }
    await page.mouse.move(x + 160, y);
    await active(page, ['right']);
    const offset = await page.locator('.dpad').evaluate(el => parseFloat(el.style.getPropertyValue('--stick-x')));
    assert.ok(offset > 0 && offset < 40, 'thumb travel is clamped to the joystick base');
    await page.mouse.move(x, y);
    await active(page, []);
    await page.mouse.move(x - 160, y);
    await active(page, ['left']);
    await page.mouse.up();
    await active(page, []);
    assert.equal(await page.locator('.dpad').evaluate(el => el.style.getPropertyValue('--stick-x')), '');
    assert.equal(await page.locator('.dpad.engaged').count(), 0);
  });

  test(`${engine}: button capture and independent keyboard sources`, async t => {
    const page = await player(t, engine);
    const { x, y } = await center(page, '[data-btn=a]');
    await page.keyboard.down('KeyL');
    await page.keyboard.down('KeyL');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(5, 5);
    await active(page, ['a']);
    assert.equal(await page.locator('[data-btn=a]').getAttribute('aria-pressed'), 'true');
    await page.mouse.up();
    await active(page, ['a']);
    assert.deepEqual(await page.evaluate(() => window.inputEvents), [['a', true]]);
    await page.keyboard.up('KeyL');
    await active(page, []);
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('ShiftRight');
    await page.keyboard.up('ShiftLeft');
    await active(page, ['select']);
    await page.keyboard.up('ShiftRight');
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowUp');
    await page.keyboard.up('KeyW');
    await active(page, ['up']);
    await page.keyboard.up('ArrowUp');
    await active(page, []);
    await page.locator('[data-btn=b]').focus();
    await page.keyboard.down('Space');
    await active(page, ['b']);
    await page.keyboard.up('Space');
    await active(page, []);
    await page.locator('[data-btn=a]').focus();
    await page.keyboard.down('Enter');
    await active(page, ['a']);
    await page.keyboard.up('Enter');
    await active(page, []);
  });

  test(`${engine}: interruption and teardown release held inputs`, async t => {
    const page = await player(t, engine);
    const { x, y } = await center(page, '.dpad');
    await page.keyboard.down('KeyL');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await active(page, []);
    await page.keyboard.up('KeyL');
    for (const event of ['pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'resize', 'visibilitychange', 'unbind']) {
      await page.mouse.move(x + 40, y);
      await page.mouse.down();
      await active(page, ['right']);
      await page.evaluate(event => {
        const dpad = document.querySelector('.dpad');
        if (event === 'unbind') window.unbindController();
        else if (event === 'visibilitychange') {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event(event));
          delete document.hidden;
        } else if (event.startsWith('pointer') || event === 'lostpointercapture') {
          dpad.dispatchEvent(new PointerEvent(event, { pointerId: 1, bubbles: true }));
        } else window.dispatchEvent(new Event(event));
      }, event);
      await active(page, []);
      await page.mouse.up();
    }
    await page.keyboard.press('KeyL');
    await active(page, []);
  });

  test(`${engine}: portrait, landscape and desktop controls stay inside viewport`, async t => {
    const page = await player(t, engine);
    for (const [width, height] of [[320, 568], [375, 667], [390, 844], [768, 1024], [568, 320], [667, 375], [844, 390], [932, 430], [1024, 768], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      const boxes = {};
      for (const selector of ['.dpad', '[data-btn=a]', '[data-btn=b]', '[data-btn=start]', '[data-btn=select]', '.screen-wrapper']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1,
          `${width}x${height}: ${selector} is outside viewport: ${JSON.stringify(box)}`);
        if (selector !== '.screen-wrapper') assert.ok(box.width >= 44 && box.height >= 44, `${selector} has a small hit target`);
        boxes[selector] = box;
      }
      const targets = Object.entries(boxes);
      const screen = boxes['.screen-wrapper'];
      assert.ok(Math.abs(screen.width / screen.height - 256 / 240) < 0.01,
        `${width}x${height}: screen aspect ratio is distorted`);
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
        const [nameA, a] = targets[i], [nameB, b] = targets[j];
        assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
          `${width}x${height}: ${nameA} overlaps ${nameB}`);
      }
    }
  });

  test(`${engine}: real game boots with the controller connected`, async t => {
    // Capture errors before loading the real emulator.
    const page = await player(t, engine);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.unroute('**/js/player.js');
    await page.reload();
    await page.locator('#loading').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#error').isVisible(), false);
    await page.locator('[data-btn=start]').tap();
    await page.keyboard.down('ArrowRight');
    assert.equal(await page.locator('[data-btn=right].pressed').count(), 1);
    await page.keyboard.up('ArrowRight');
    assert.deepEqual(errors, []);
  });
}

for (const [width, height] of [[390, 844], [844, 390]]) {
  test(`touch ${width}x${height}: joystick + A + B, multiple fingers on one button, and unrelated lifts`, async t => {
    const page = await player(t, 'chromium', { width, height });
    const session = await page.context().newCDPSession(page);
    const stick = await center(page, '.dpad');
    const a = await center(page, '[data-btn=a]');
    const b = await center(page, '[data-btn=b]');
    const points = new Map();
    const touch = async (type, id, point) => {
      const ended = points.get(id);
      if (point) points.set(id, { id, ...point });
      else points.delete(id);
      // CDP touchEnd identifies the lifted contacts, not the remaining contacts.
      await session.send('Input.dispatchTouchEvent', {
        type, touchPoints: type === 'touchEnd' ? [ended] : [...points.values()],
      });
    };
    await touch('touchStart', 1, { x: stick.x + 40, y: stick.y });
    await active(page, ['right']);
    await touch('touchStart', 2, a);
    await touch('touchStart', 3, b);
    await active(page, ['right', 'a', 'b']);
    await touch('touchStart', 4, { x: stick.x - 40, y: stick.y });
    await active(page, ['right', 'a', 'b']);
    await touch('touchEnd', 4);
    await active(page, ['right', 'a', 'b']);
    await touch('touchMove', 1, { x: stick.x - 40, y: stick.y - 40 });
    await active(page, ['left', 'up', 'a', 'b']);
    await touch('touchEnd', 2);
    await active(page, ['left', 'up', 'b']);
    await touch('touchStart', 5, b);
    await touch('touchEnd', 3);
    await active(page, ['left', 'up', 'b']);
    await touch('touchEnd', 1);
    await active(page, ['b']);
    await touch('touchEnd', 5);
    await active(page, []);
    assert.equal(await page.evaluate(() => window.visualViewport.scale), 1);
  });
}
