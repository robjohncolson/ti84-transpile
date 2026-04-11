const LCD_WIDTH = 320;
const LCD_HEIGHT = 240;
const PIXEL_COUNT = LCD_WIDTH * LCD_HEIGHT;
const DEFAULT_VRAM_BASE = 0xd40000;

export function createLCDRenderer(canvas, memory, options = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas context is required");
  }

  const imageData = new ImageData(LCD_WIDTH, LCD_HEIGHT);
  const data = imageData.data;
  let vramBase = (options.vramBase ?? DEFAULT_VRAM_BASE) & 0xffffff;
  let frameCount = 0;

  function renderFrame() {
    const base = vramBase;
    for (let i = 0; i < PIXEL_COUNT; i += 1) {
      const off = base + (i << 1);
      const px = memory[off] | (memory[off + 1] << 8);
      const j = i << 2;
      data[j] = ((px >> 8) & 0xf8) | ((px >> 13) & 0x07);
      data[j + 1] = ((px >> 3) & 0xfc) | ((px >> 9) & 0x03);
      data[j + 2] = ((px << 3) & 0xf8) | ((px >> 2) & 0x07);
      data[j + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    frameCount += 1;
  }

  function setVRAMBase(addr) {
    vramBase = addr & 0xffffff;
  }

  function getState() {
    return { vramBase, frameCount };
  }

  function destroy() {}

  return { renderFrame, setVRAMBase, getState, destroy };
}
