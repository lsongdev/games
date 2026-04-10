
const GAMES = new Map([
  ['Super Mario 1', 'roms/super-mario-1.nes'],
  ['Super Mario 2', 'roms/super-mario-2.nes'],
  ['Super Mario 3', 'roms/super-mario-3.nes'],
  ['1942', 'roms/1942 (JU).nes'],
  ['The Goonies 2', 'roms/goonies-2.nes'],
  ['Silkworm', 'roms/silkworm.nes'],
  ['Adventure Island 3', 'roms/adventure-island-3.nes'],
  ['Adventure Island 4', 'roms/adventure-island-4.nes'],
  ['Battle City', 'roms/battle-city.nes'],
  ['Donkey Kong 1', 'roms/donkey-kong.nes'],
  ['Captain Tsubasa 2', 'roms/captain-tsubasa-2.nes'],
  ['Ninja Gaiden 2', 'roms/ninja-gaiden-2.nes'],
  ['Final Fantasy', 'roms/final-fantasy.nes'],
  ['Final Fantasy 2', 'roms/final-fantasy-2.nes'],
  ['Chip Dale 2', 'roms/chip-dale-2.nes'],
  ['Rockman', 'roms/mega-man.nes'],
  ['Road Fighter', 'roms/road-fighter.nes'],
  ['Jackal', 'roms/jackal.nes'],
  ['Metal Max', 'roms/metal-max.nes'],
  ['Snow Bros', 'roms/snow-bros.nes'],
  ['Contra', 'roms/contra.nes'],
  ['Contra 2', 'roms/contra-2.nes'],
]);

const basename = fullpath => {
  return fullpath
};

class GameSelector {
  constructor(element, progressElement = document.createElement("p")) {
    this.element = element;
    this.progressElement = progressElement;
    this.onChange = () => void 0;
    element.after(this.progressElement);
    this.element.innerHTML = Array.from(GAMES.entries()).map(([k, v]) => {
      return `<option value="${v}">${k}</option>`;
    }).join("");
    this.element.value = "";
    this.element.addEventListener("change", (e) => {
      this.fetchGameData(this.element.value);
    });
  }
  async fetchGameData(url) {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = response.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        if (total) {
          this.progressElement.innerText = `${Math.floor(loaded * 100 / total)}%`;
        }
      }

      const arrayBuffer = new Uint8Array(loaded);
      let position = 0;
      for (const chunk of chunks) {
        arrayBuffer.set(chunk, position);
        position += chunk.length;
      }

      this.element.disabled = true;
      this.onChange(basename(url), arrayBuffer);
    } catch (e) {
      alert(e.message);
    }
  }
}
export {
  GameSelector
};
