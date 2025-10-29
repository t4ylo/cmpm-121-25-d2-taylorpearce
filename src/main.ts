import "./style.css";

// --- Core Types ---
type Point = { x: number; y: number };
type DisplayCommand = { display(ctx: CanvasRenderingContext2D): void };
type DraggableCommand = DisplayCommand & { drag(x: number, y: number): void };

// --- Marker Line ---
function createMarkerLine(
  start: Point,
  opts?: { strokeStyle?: string; lineWidth?: number },
): DraggableCommand {
  const points: Point[] = [start];
  const strokeStyle = opts?.strokeStyle ?? "black";
  const lineWidth = opts?.lineWidth ?? 3; // Step 11: nicer default thin=3
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
      ctx.fillStyle = "rgba(0,0,0,0.08)";
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

function createStickerPreview(
  getEmoji: () => string,
  getFontPx: () => number,
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
      ctx.font =
        `${getFontPx()}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.7;
      ctx.fillText(getEmoji(), x, y);
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
}

// --- Sticker Command ---
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

// Step 11 tuning: defaults feel nicer to draw with.
const currentStrokeStyle = "black";
let currentLineWidth = 3; // Fine default bumped from 2 → 3

// Step 11 tuning: starter stickers + sizes adjusted for visual balance. :contentReference[oaicite:1]{index=1}
type StickerDef = { emoji: string; px: number };
const stickerDefs: StickerDef[] = [
  { emoji: "⭐", px: 36 },
  { emoji: "😊", px: 34 },
  { emoji: "🍓", px: 32 },
  { emoji: "🔥", px: 34 },
  { emoji: "🌸", px: 32 },
  { emoji: "🪩", px: 30 },
];
const firstSticker = stickerDefs[0] ?? { emoji: "⭐", px: 36 };
let currentSticker = firstSticker.emoji;
let currentStickerPx = firstSticker.px;

let previewCmd: PreviewCommand | null = null;
type Cursor = { active: boolean; x: number; y: number };
const cursor: Cursor = { active: false, x: 0, y: 0 };

// --- UI Helpers ---
function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = "btn"; // Step 11: nicer shared styles via injected CSS
  return b;
}
function createDrawingCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.id = "drawingCanvas";
  c.style.border = "1px solid #ccc";
  c.style.cursor = "crosshair";
  c.style.borderRadius = "10px"; // small polish
  c.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
  return c;
}

// --- Step 10: High-Res Export ---
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
  // Step 11: inject minimal CSS to polish buttons/selection. :contentReference[oaicite:2]{index=2}
  const style = document.createElement("style");
  style.textContent = `
    .toolbar { display:flex; gap:8px; align-items:center; justify-content:center; }
    .btn {
      padding: 6px 12px; font-size: 14px; cursor: pointer;
      border: 1px solid #ddd; border-radius: 8px; background: #fafafa;
      transition: transform .06s ease, background .12s ease, box-shadow .12s ease;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }
    .btn:hover { background:#f2f2f2; transform: translateY(-1px); }
    .selectedTool { outline:2px solid #111; outline-offset:2px; border-radius:8px; background:#fff; }
  `;
  document.head.appendChild(style);

  const app = document.createElement("div");
  Object.assign(app.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    marginTop: "20px",
  } as CSSStyleDeclaration);
  document.body.appendChild(app);

  // Different titles (per Step 11). :contentReference[oaicite:3]{index=3}
  const h1 = document.createElement("h1");
  h1.textContent = "Sticker Sketchpad";
  h1.style.textAlign = "center";
  h1.style.fontFamily =
    "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  app.appendChild(h1);

  const canvas = createDrawingCanvas(256, 256);
  const ctx = canvas.getContext("2d")!;
  app.appendChild(canvas);

  // Toolbars
  const row1 = Object.assign(document.createElement("div"), {
    className: "toolbar",
  });
  const row2 = Object.assign(document.createElement("div"), {
    className: "toolbar",
  });
  const row3 = Object.assign(document.createElement("div"), {
    className: "toolbar",
  });
  row3.style.marginTop = "10px";
  app.append(row1, row2, row3);

  // Step 11: nicer labels + tuned widths
  const fineBtn = makeButton("Pen • Fine");
  const boldBtn = makeButton("Pen • Bold");
  row1.append(fineBtn, boldBtn);

  const setMarker = (w: number, btn: HTMLButtonElement) => {
    currentTool = "marker";
    currentLineWidth = w;
    [...row1.children, ...row2.children].forEach((el) =>
      (el as HTMLElement).classList.remove("selectedTool")
    );
    btn.classList.add("selectedTool");
    setPreview();
    canvas.dispatchEvent(new Event("tool-moved"));
  };
  fineBtn.onclick = () => setMarker(3, fineBtn); // 3px feels smooth for sketches
  boldBtn.onclick = () => setMarker(10, boldBtn); // 10px is a bold “marker” feel

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
          (el as HTMLElement).classList.remove("selectedTool")
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
    // Step 11: default new stickers a touch larger so they read well.
    stickerDefs.push({ emoji: s, px: 34 });
    renderStickers();
    stickerBtns.at(-1)?.click();
  };

  // Undo/Redo/Clear/Export
  const undoBtn = makeButton("Undo");
  const redoBtn = makeButton("Redo");
  const clearBtn = makeButton("Clear");
  const exportBtn = makeButton("Export PNG");
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

  // Undo/Redo
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
  fineBtn.click(); // select the “Pen • Fine” by default (applies preview too)
  canvas.dispatchEvent(new Event("tool-moved"));
}

initUI();
