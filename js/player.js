import { Browser } from "../jsnes/index.js";

const INDEX_URL = "files/index.json";
const ROM_BASE = "files/roms/";
const COVER_BASE = "files/covers/";

const GENRE_LABELS = {
  action: '动作', adventure: '冒险', classic: '经典',
  fighting: '格斗', platform: '平台', puzzle: '益智',
  racing: '竞速', rpg: '角色扮演', shooter: '射击',
  simulation: '模拟', sports: '体育', strategy: '策略',
};

function getGameId() {
  return new URLSearchParams(window.location.search).get("game");
}

function showLoading(on) {
  document.getElementById("loading").classList.toggle("hidden", !on);
}

function showErr(msg) {
  document.getElementById("error-msg").textContent = msg;
  document.getElementById("error").classList.remove("hidden");
  showLoading(false);
}

function populateInfo(g) {
  document.getElementById("game-title").textContent = g.title || g.id;
  document.getElementById("game-title-cn").textContent = g.titleCn || '';

  const coverEl = document.getElementById("game-cover");
  if (g.cover) {
    coverEl.src = `${COVER_BASE}${g.cover}`;
    coverEl.alt = g.title || g.id;
  } else {
    coverEl.style.display = 'none';
  }

  if (g.description) {
    document.getElementById("game-desc").textContent = g.description;
  }

  const badges = document.getElementById("game-badges");
  const parts = [];
  if (g.year) parts.push(`<span class="badge year">${g.year}</span>`);
  if (g.genre) parts.push(`<span class="badge">${GENRE_LABELS[g.genre] || g.genre}</span>`);
  if (g.players) parts.push(`<span class="badge players">${g.players}P</span>`);
  if (g.rating) parts.push(`<span class="badge rating">${'★'.repeat(g.rating)}${'☆'.repeat(5 - g.rating)}</span>`);
  badges.innerHTML = parts.join('');
}

async function fetchGame(id) {
  const r = await fetch(INDEX_URL);
  if (!r.ok) throw new Error("Failed to load game index");
  const { games } = await r.json();
  const g = games.find(x => x.id === id);
  if (!g) throw new Error(`Game "${id}" not found`);
  populateInfo(g);

  const r2 = await fetch(`${ROM_BASE}${g.rom}`);
  if (!r2.ok) throw new Error(`ROM not found: ${g.rom}`);
  return { rom: g.rom, data: new Uint8Array(await r2.arrayBuffer()) };
}

function run(rom, romData) {
  const sramKey = `sram:${rom}`;

  // Setup SRAM save callback
  const onBatteryRamWrite = (address, value) => {
    try {
      // Debounced SRAM save
      clearTimeout(window._sramSaveTimeout);
      window._sramSaveTimeout = setTimeout(() => {
        if (jsnesBrowser && jsnesBrowser.nes.mmap && jsnesBrowser.nes.mmap.batteryRam) {
          localStorage.setItem(sramKey, JSON.stringify(Array.from(jsnesBrowser.nes.mmap.batteryRam)));
        }
      }, 1000);
    } catch { /* ignore */ }
  };

  // Create JSNes Browser emulator
  const screenContainer = document.getElementById('screen-container');
  const jsnesBrowser = new Browser({
    container: screenContainer,
    romData: romData.reduce((data, byte) => data + String.fromCharCode(byte), ''),
    onBatteryRamWrite: onBatteryRamWrite,
    onError: (e) => {
      console.error(e);
      showErr(e.message);
    },
  });

  // Ensure the canvas fills the container
  const resizeCanvas = () => {
    jsnesBrowser.fitInParent();
    // Also set CSS max-dimensions to ensure proper scaling
    const canvas = screenContainer.querySelector('canvas');
    if (canvas) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'contain';
    }
  };
  resizeCanvas();

  // Load SRAM if available
  try {
    const raw = localStorage.getItem(sramKey);
    if (raw && jsnesBrowser.nes.mmap) {
      const sram = JSON.parse(raw);
      // Restore battery RAM
      if (jsnesBrowser.nes.mmap.batteryRam && sram.length <= jsnesBrowser.nes.mmap.batteryRam.length) {
        for (let i = 0; i < sram.length; i++) {
          jsnesBrowser.nes.mmap.batteryRam[i] = sram[i];
        }
      }
    }
  } catch { /* ignore */ }

  // Button mapping - JSNes controller constants
  const map = {
    KeyW: 4,  // BUTTON_UP
    KeyS: 5,  // BUTTON_DOWN
    KeyA: 6,  // BUTTON_LEFT
    KeyD: 7,  // BUTTON_RIGHT
    Enter: 3, // BUTTON_START
    ShiftRight: 2, // BUTTON_SELECT
    ShiftLeft: 2,  // BUTTON_SELECT
    KeyL: 0,  // BUTTON_A
    KeyK: 1,  // BUTTON_B
  };

  const pressed = new Set();

  function press(btn) {
    if (!pressed.has(btn)) {
      pressed.add(btn);
      jsnesBrowser.nes.buttonDown(1, btn);
      jsnesBrowser.nes.buttonDown(2, btn);
    }
  }

  function release(btn) {
    pressed.delete(btn);
    jsnesBrowser.nes.buttonUp(1, btn);
    jsnesBrowser.nes.buttonUp(2, btn);
  }

  // Keyboard - override Browser's keyboard handler
  const kbHandler = e => {
    const btn = map[e.code];
    if (btn !== undefined) {
      if (e.type === "keydown") press(btn);
      else release(btn);
      e.preventDefault();
    }
  };
  document.addEventListener("keydown", kbHandler);
  document.addEventListener("keyup", kbHandler);

  // Touch / pointer controls on controller buttons
  const btnMap = {
    up: 4,
    down: 5,
    left: 6,
    right: 7,
    a: 0,
    b: 1,
    start: 3,
    select: 2,
  };

  document.querySelectorAll('[data-btn]').forEach(el => {
    const btn = btnMap[el.dataset.btn];
    if (btn === undefined) return;

    const onDown = e => { e.preventDefault(); press(btn); el.classList.add('pressed'); };
    const onUp = e => { e.preventDefault(); release(btn); el.classList.remove('pressed'); };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('pointercancel', onUp);
  });

  showLoading(false);

  // Handle window resize
  const handleResize = () => resizeCanvas();
  window.addEventListener('resize', handleResize);

  window.addEventListener("beforeunload", () => {
    document.removeEventListener("keydown", kbHandler);
    document.removeEventListener("keyup", kbHandler);
    window.removeEventListener('resize', handleResize);
    jsnesBrowser.destroy();
  });
}

// ── boot ──────────────────────────────────────────────────────────
const gameId = getGameId();
if (!gameId) {
  showErr("No game specified.");
} else {
  fetchGame(gameId)
    .then(({ rom, data }) => run(rom, data))
    .catch(e => { console.error(e); showErr(e.message); });
}
