import { Emulator } from "../nes/core/index.js";
import { StandardControllerButton } from "../nes/core/api/controller.js";
import { Screen } from "../nes/dom/screen.js";
import { Audio } from "../nes/dom/audio.js";

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

function run(rom, data) {
  const audio = new Audio();
  const screen = new Screen(document.getElementById("screen"));
  const sramKey = `sram:${rom}`;

  let sram;
  try {
    const raw = localStorage.getItem(sramKey);
    if (raw) sram = Uint8Array.from(JSON.parse(raw));
  } catch { /* ignore */ }

  const emu = new Emulator(data, {
    sampleRate: audio.sampleRate,
    onSample: v => audio.onSample(v),
    onFrame: f => screen.onFrame(f),
    sramLoad: sram,
  });

  audio.emulator = emu;
  screen.emulator = emu;
  audio.start();

  const tid = setInterval(() => {
    try { localStorage.setItem(sramKey, JSON.stringify(Array.from(emu.sram))); } catch { /* */ }
  }, 3000);

  // Button mapping
  const map = {
    KeyW: StandardControllerButton.UP,
    KeyS: StandardControllerButton.DOWN,
    KeyA: StandardControllerButton.LEFT,
    KeyD: StandardControllerButton.RIGHT,
    Enter: StandardControllerButton.START,
    ShiftRight: StandardControllerButton.SELECT,
    ShiftLeft: StandardControllerButton.SELECT,
    KeyL: StandardControllerButton.A,
    KeyK: StandardControllerButton.B,
  };

  const pressed = new Set();

  function press(btn) {
    if (!pressed.has(btn)) {
      pressed.add(btn);
      emu.standardController1.updateButton(btn, true);
      emu.standardController2.updateButton(btn, true);
    }
  }

  function release(btn) {
    pressed.delete(btn);
    emu.standardController1.updateButton(btn, false);
    emu.standardController2.updateButton(btn, false);
  }

  // Keyboard
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
    up: StandardControllerButton.UP,
    down: StandardControllerButton.DOWN,
    left: StandardControllerButton.LEFT,
    right: StandardControllerButton.RIGHT,
    a: StandardControllerButton.A,
    b: StandardControllerButton.B,
    start: StandardControllerButton.START,
    select: StandardControllerButton.SELECT,
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

  const loop = () => { emu.frame(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  window.addEventListener("beforeunload", () => {
    clearInterval(tid);
    document.removeEventListener("keydown", kbHandler);
    document.removeEventListener("keyup", kbHandler);
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
