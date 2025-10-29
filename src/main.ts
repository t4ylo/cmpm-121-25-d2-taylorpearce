import "./style.css";

// --- Core Types ---
// Command-based drawing model for undo/redo and tool extensibility.
type Point = { x: number; y: number };
type DisplayCommand = { display(ctx: CanvasRenderingContext2D): void };
type DraggableCommand = DisplayCommand & { drag(x: number, y: number): void };

// --- Factory: Marker Line ---
function createMarkerLine(
  start: Point,
  opts?: { strokeStyle?: string; lineWidth?: number },
): DraggableCommand {
  const points: Point[] = [start];
  const strokeStyle = opts?.strokeStyle ?? "black";
  const lineWidth = opts?.lineWidth ?? 2;
  return {
    drag(x, y) {
      points.push({ x, y });
    },
    display(ctx) {
      if (!points.length) return;
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (points.length === 1) {
        const p = points[0]!;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = strokeStyle;
        ctx.fill();
        ctx.restore();
        return;
      }
      const first = points[0]!;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x, points[i]!.y);
      }
      ctx.stroke();
      ctx.restore();
    },
  };
}

// --- Previews ---
type PreviewCommand = {
  set(x: number, y: number): void;
  show(): void;
  hide(): void;
  visible(): boolean;
  display(ctx: CanvasRenderingContext2D): void;
};

// Marker preview circle.
function createMarkerPreview(
  getColor: () => string,
  getWidth: () => number,
): PreviewCommand {
  let x = 0, y = 0, vis = false;
  return {
    set(nx, ny) {
      x = nx;
      y = ny;
    },
    show() {
      vis = true;
    },
    hide() {
      vis = false;
    },
    visible() {
      return vis;
    },
    display(ctx) {
      if (!vis) return;
      ctx.save();
      const lw = getWidth();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.arc(x, y, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fillStyle = getColor();
      ctx.fill();
      ctx.restore();
    },
  };
}

// Sticker preview emoji.
function createStickerPreview(
  getEmoji: () => string,
  getFont: () => number,
): PreviewCommand {
  let x = 0, y = 0, vis = false;
  return {
    set(nx, ny) {
      x = nx;
      y = ny;
    },
    show() {
      vis = true;
    },
    hide() {
      vis = false;
    },
    visible() {
      return vis;
    },
    display(ctx) {
      if (!vis) return;
      ctx.save();
      ctx.font = `${getFont()}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.7;
      ctx.fillText(getEmoji(), x, y);
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
}

// --- Factory: Sticker Command ---
function createSticker(
  start: Point,
  emoji: string,
  px: number,
): DraggableCommand {
  const pos = { ...start };
  return {
    drag(x, y) {
      pos.x = x;
      pos.y = y;
    },
    display(ctx) {
      ctx.save();
      ctx.font = `${px}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, pos.x, pos.y);
      ctx.restore();
    },
  };
}

// --- Model ---
const displayList: DisplayCommand[] = [];
const redoStack: DisplayCommand[] = [];
type ToolMode = "marker" | "sticker";
let currentTool: ToolMode = "marker";
const currentStrokeStyle = "black";
let currentLineWidth = 2;

// Data-driven stickers (Step 9).
type StickerDef = { emoji: string; px: number };
const stickerDefs: StickerDef[] = [
  { emoji: "⭐", px: 32 },
  { emoji: "😊", px: 32 },
  { emoji: "🍓", px: 32 },
  { emoji: "🔥", px: 32 },
];
const firstSticker = stickerDefs[0] ?? { emoji: "⭐", px: 32 };
let currentSticker = firstSticker.emoji;
let currentStickerPx = firstSticker.px;

let previewCmd: PreviewCommand | null = null;
type Cursor = { active: boolean; x: number; y: number };
const cursor: Cursor = { active: false, x: 0, y: 0 };

// --- UI Helpers ---
function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.padding = "6px 12px";
  b.style.fontSize = "14px";
  b.style.cursor = "pointer";
  return b;
}
function createDrawingCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.style.border = "1px solid #ccc";
  c.style.cursor = "crosshair";
  return c;
}

// --- Step 10: High-Resolution Export (1024×1024 PNG) ---
function exportHighResPNG(displayList: DisplayCommand[]) {
  const big = document.createElement("canvas");
  big.width = 1024;
  big.height = 1024;
  const bctx = big.getContext("2d");
  if (!bctx) return;
  bctx.save();
  bctx.scale(4, 4); // 256×4 = 1024
  for (const cmd of displayList) cmd.display(bctx);
  bctx.restore();
  const anchor = document.createElement("a");
  anchor.href = big.toDataURL("image/png");
  anchor.download = "sketchpad.png";
  anchor.click();
}

// --- App Bootstrap ---
function initUI(): void {
  const app = document.createElement("div");
  Object.assign(app.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    marginTop: "20px",
  });
  document.body.appendChild(app);

  const canvas = createDrawingCanvas(256, 256);
  const ctx = canvas.getContext("2d")!;
  app.appendChild(
    Object.assign(document.createElement("h1"), {
      textContent: "Sticker Sketchpad",
      style: "text-align:center;font-family:sans-serif",
    }),
  );
  app.appendChild(canvas);

  const row1 = document.createElement("div"),
    row2 = document.createElement("div"),
    row3 = document.createElement("div");
  [row1, row2, row3].forEach((r) =>
    Object.assign(r.style, {
      display: "flex",
      gap: "8px",
      justifyContent: "center",
      alignItems: "center",
    })
  );
  row3.style.marginTop = "10px";
  app.append(row1, row2, row3);

  // Marker tools
  const thinBtn = makeButton("Thin"), thickBtn = makeButton("Thick");
  row1.append(thinBtn, thickBtn);

  const setMarker = (w: number, btn: HTMLButtonElement) => {
    currentTool = "marker";
    currentLineWidth = w;
    [...row1.children, ...row2.children].forEach((el) =>
      el.classList?.remove("selectedTool")
    );
    btn.classList.add("selectedTool");
    setPreview();
    canvas.dispatchEvent(new Event("tool-moved"));
  };
  thinBtn.onclick = () => setMarker(2, thinBtn);
  thickBtn.onclick = () => setMarker(8, thickBtn);

  // Stickers
  const addBtn = makeButton("+ Add Sticker");
  let stickerBtns: HTMLButtonElement[] = [];
  const renderStickers = () => {
    row2.innerHTML = "";
    stickerBtns = [];
    for (const def of stickerDefs) {
      const b = makeButton(def.emoji);
      b.onclick = () => {
        currentTool = "sticker";
        currentSticker = def.emoji;
        currentStickerPx = def.px;
        [...row1.children, ...row2.children].forEach((el) =>
          el.classList?.remove("selectedTool")
        );
        b.classList.add("selectedTool");
        setPreview();
        canvas.dispatchEvent(new Event("tool-moved"));
      };
      row2.append(b);
      stickerBtns.push(b);
    }
    row2.append(addBtn);
  };
  addBtn.onclick = () => {
    const t = globalThis.prompt("Custom sticker text", "🧽");
    if (!t) return;
    const s = t.trim();
    if (!s) return;
    stickerDefs.push({ emoji: s, px: 32 });
    renderStickers();
    stickerBtns.at(-1)?.click();
  };

  // Undo/Redo/Clear/Export
  const undoBtn = makeButton("Undo"),
    redoBtn = makeButton("Redo"),
    clearBtn = makeButton("Clear"),
    exportBtn = makeButton("Export PNG");
  row3.append(undoBtn, redoBtn, clearBtn, exportBtn);

  clearBtn.onclick = () => {
    displayList.length = 0;
    redoStack.length = 0;
    canvas.dispatchEvent(new Event("drawing-changed"));
  };
  exportBtn.onclick = () => exportHighResPNG(displayList);

  // Observers
  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of displayList) c.display(ctx);
    if (!cursor.active && previewCmd?.visible()) previewCmd.display(ctx);
  };
  const updateCtrls = () => {
    undoBtn.disabled = !displayList.length;
    redoBtn.disabled = !redoStack.length;
  };
  const refresh = () => {
    redraw();
    updateCtrls();
  };
  canvas.addEventListener("drawing-changed", refresh);
  canvas.addEventListener("tool-moved", refresh);

  const setPreview = () => {
    previewCmd = currentTool === "marker"
      ? createMarkerPreview(() => currentStrokeStyle, () => currentLineWidth)
      : createStickerPreview(() => currentSticker, () => currentStickerPx);
  };

  // Input handling
  let currentCmd: DraggableCommand | null = null;
  canvas.onmousedown = (e) => {
    cursor.active = true;
    cursor.x = e.offsetX;
    cursor.y = e.offsetY;
    previewCmd?.hide();
    if (redoStack.length) redoStack.length = 0;
    currentCmd = currentTool === "marker"
      ? createMarkerLine({ x: cursor.x, y: cursor.y }, {
        strokeStyle: currentStrokeStyle,
        lineWidth: currentLineWidth,
      })
      : createSticker(
        { x: cursor.x, y: cursor.y },
        currentSticker,
        currentStickerPx,
      );
    displayList.push(currentCmd);
    canvas.dispatchEvent(new Event("drawing-changed"));
  };
  canvas.onmousemove = (e) => {
    cursor.x = e.offsetX;
    cursor.y = e.offsetY;
    if (cursor.active && currentCmd) {
      currentCmd.drag(cursor.x, cursor.y);
      canvas.dispatchEvent(new Event("drawing-changed"));
      return;
    }
    previewCmd?.set(cursor.x, cursor.y);
    previewCmd?.show();
    canvas.dispatchEvent(new Event("tool-moved"));
  };
  const endStroke = () => {
    cursor.active = false;
    currentCmd = null;
    previewCmd?.set(cursor.x, cursor.y);
    previewCmd?.show();
    canvas.dispatchEvent(new Event("tool-moved"));
  };
  canvas.onmouseup = endStroke;
  canvas.onmouseleave = () => {
    previewCmd?.hide();
    canvas.dispatchEvent(new Event("tool-moved"));
    endStroke();
  };

  // Undo/Redo logic
  const undo = () => {
    if (!displayList.length) return;
    redoStack.push(displayList.pop()!);
    canvas.dispatchEvent(new Event("drawing-changed"));
  };
  const redo = () => {
    if (!redoStack.length) return;
    displayList.push(redoStack.pop()!);
    canvas.dispatchEvent(new Event("drawing-changed"));
  };
  undoBtn.onclick = undo;
  redoBtn.onclick = redo;
  globalThis.onkeydown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if (e.key.toLowerCase() === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }
  };

  // Init
  renderStickers();
  setMarker(2, thinBtn);
  canvas.dispatchEvent(new Event("tool-moved"));
}

initUI();
