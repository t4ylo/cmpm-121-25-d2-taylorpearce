import "./style.css";

// --- Core Types ---
// Command-based drawing model enables undo/redo, tool switching, and previews.
type Point = { x: number; y: number };
type DisplayCommand = { display(ctx: CanvasRenderingContext2D): void };
type DraggableCommand = DisplayCommand & { drag(x: number, y: number): void };

// --- Factory: Marker Line ---
// Freehand stroke: records points on drag; renders dot/line; captures style via closure.
function createMarkerLine(
  start: Point,
  opts?: { strokeStyle?: string; lineWidth?: number },
): DraggableCommand {
  const points: Point[] = [start];
  const strokeStyle = opts?.strokeStyle ?? "black";
  const lineWidth = opts?.lineWidth ?? 2;

  return {
    drag(x: number, y: number) {
      points.push({ x, y });
    },
    display(ctx: CanvasRenderingContext2D) {
      if (points.length === 0) return;

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
        const pt = points[i]!;
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.restore();
    },
  };
}

// --- Preview Commands ---
// Compact objects with display() used to render a non-committed tool preview.
type PreviewCommand = {
  set(x: number, y: number): void;
  show(): void;
  hide(): void;
  visible(): boolean;
  display(ctx: CanvasRenderingContext2D): void;
};

// Marker preview: circle matching lineWidth at cursor position.
function createMarkerPreview(
  getStrokeStyle: () => string,
  getLineWidth: () => number,
): PreviewCommand {
  let x = 0, y = 0, isVisible = false;

  return {
    set(nx, ny) {
      x = nx;
      y = ny;
    },
    show() {
      isVisible = true;
    },
    hide() {
      isVisible = false;
    },
    visible() {
      return isVisible;
    },
    display(ctx) {
      if (!isVisible) return;
      ctx.save();
      const lw = getLineWidth();
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.arc(x, y, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fillStyle = getStrokeStyle();
      ctx.fill();
      ctx.restore();
    },
  };
}

// Sticker preview: semi-transparent emoji under the cursor.
function createStickerPreview(
  getEmoji: () => string,
  getFontPx: () => number,
): PreviewCommand {
  let x = 0, y = 0, isVisible = false;

  return {
    set(nx, ny) {
      x = nx;
      y = ny;
    },
    show() {
      isVisible = true;
    },
    hide() {
      isVisible = false;
    },
    visible() {
      return isVisible;
    },
    display(ctx) {
      if (!isVisible) return;
      ctx.save();
      ctx.font =
        `${getFontPx()}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.7;
      ctx.fillText(getEmoji(), x, y);
      ctx.globalAlpha = 1.0;
      ctx.restore();
    },
  };
}

// --- Factory: Sticker Command ---
// Single emoji “object” you can place and drag (repositions instead of recording a path).
function createSticker(
  start: Point,
  emoji: string,
  fontPx: number,
): DraggableCommand {
  const pos = { ...start }; // object mutated, binding doesn’t change

  return {
    drag(x, y) {
      pos.x = x;
      pos.y = y;
    },
    display(ctx) {
      ctx.save();
      ctx.font = `${fontPx}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, pos.x, pos.y);
      ctx.restore();
    },
  };
}

// --- Model ---
// Display list & redo stack store commands; observer repaints on “drawing-changed” / “tool-moved”.
const displayList: DisplayCommand[] = [];
const redoStack: DisplayCommand[] = [];

type ToolMode = "marker" | "sticker";
let currentToolMode: ToolMode = "marker";

const currentStrokeStyle = "black"; // color (constant for now)
let currentLineWidth = 2; // marker thickness (Step 6)

type StickerDef = { emoji: string; px: number };
const stickerDefs: StickerDef[] = [
  { emoji: "⭐", px: 32 },
  { emoji: "😊", px: 32 },
  { emoji: "🍓", px: 32 },
  { emoji: "🔥", px: 32 },
];
// Safe default for first sticker (strict TS-friendly).
const firstSticker = stickerDefs[0] ?? { emoji: "⭐", px: 32 };
let currentSticker = firstSticker.emoji;
let currentStickerPx = firstSticker.px;

// Single preview ref that swaps between marker/sticker preview.
let previewCmd: PreviewCommand | null = null;

// Cursor state used by both tools.
type Cursor = { active: boolean; x: number; y: number };
const cursor: Cursor = { active: false, x: 0, y: 0 };

// --- Small UI Helpers ---
// Minimal element factories keep initUI tidy and focused.
function createAppTitle(titleText: string): HTMLElement {
  const title = document.createElement("h1");
  title.textContent = titleText;
  title.style.textAlign = "center";
  title.style.fontFamily = "sans-serif";
  return title;
}

function createDrawingCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.id = "drawingCanvas";
  c.style.border = "1px solid #ccc";
  c.style.cursor = "crosshair";
  return c;
}

function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.padding = "6px 12px";
  b.style.fontSize = "14px";
  b.style.cursor = "pointer";
  return b;
}

// --- App Bootstrap (Steps 1–9) ---
// Builds layout, wires observers, tools, previews, and input handling.
function initUI(): void {
  // Tiny style for selected tool feedback.
  const style = document.createElement("style");
  style.textContent =
    `.selectedTool{outline:2px solid #111; outline-offset:2px; border-radius:6px}`;
  document.head.appendChild(style);

  // Container + centered layout.
  const app = document.createElement("div");
  app.id = "app";
  Object.assign(app.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginTop: "20px",
  } as CSSStyleDeclaration);
  document.body.appendChild(app);

  // Title + canvas.
  const title = createAppTitle("Sticker Sketchpad");
  const canvas = createDrawingCanvas(256, 256);
  app.appendChild(title);
  app.appendChild(canvas);

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  // Tool rows: markers (row1), stickers & add button (row2), and undo/redo (row3).
  const toolRow1 = document.createElement("div");
  const toolRow2 = document.createElement("div");
  const undoRedoRow = document.createElement("div");
  [toolRow1, toolRow2, undoRedoRow].forEach((row) => {
    Object.assign(row.style, {
      display: "flex",
      gap: "8px",
      alignItems: "center",
      justifyContent: "center",
    } as CSSStyleDeclaration);
    app.appendChild(row);
  });
  undoRedoRow.style.marginTop = "10px";

  // Marker tools (Step 6).
  const thinBtn = makeButton("Thin");
  const thickBtn = makeButton("Thick");
  toolRow1.append(thinBtn, thickBtn);

  // Sticker tools (Step 8/9).
  let stickerBtns: HTMLButtonElement[] = [];
  const addStickerBtn = makeButton("+ Add Sticker");

  // Rebuilds sticker buttons from data array (Step 9 data-driven UI).
  const renderStickerButtons = () => {
    toolRow2.innerHTML = "";
    stickerBtns = [];

    for (const def of stickerDefs) {
      const b = makeButton(def.emoji);
      stickerBtns.push(b);
      toolRow2.append(b);
      b.addEventListener("click", () => {
        currentToolMode = "sticker";
        currentSticker = def.emoji;
        currentStickerPx = def.px;
        [...toolRow1.children, ...toolRow2.children].forEach((el) =>
          el.classList?.remove("selectedTool")
        );
        b.classList.add("selectedTool");
        setPreviewForCurrentTool();
        canvas.dispatchEvent(new Event("tool-moved")); // preview refresh
      });
    }

    toolRow2.append(addStickerBtn);
  };

  // Add Sticker flow (uses prompt; adds to array; rebuilds UI; selects new).
  addStickerBtn.addEventListener("click", () => {
    const text = globalThis.prompt("Custom sticker text", "🧽");
    if (text == null) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    stickerDefs.push({ emoji: trimmed, px: 32 });
    renderStickerButtons();
    // auto-select the newly added sticker
    const newBtn = stickerBtns[stickerBtns.length - 1]!;
    newBtn.click();
  });

  // Marker tool setter (updates shared state + UI + preview).
  const setMarkerTool = (lineWidth: number, clicked: HTMLButtonElement) => {
    currentToolMode = "marker";
    currentLineWidth = lineWidth;
    [...toolRow1.children, ...toolRow2.children].forEach((el) =>
      el.classList?.remove("selectedTool")
    );
    clicked.classList.add("selectedTool");
    setPreviewForCurrentTool();
    canvas.dispatchEvent(new Event("tool-moved"));
  };
  thinBtn.addEventListener("click", () => setMarkerTool(2, thinBtn));
  thickBtn.addEventListener("click", () => setMarkerTool(8, thickBtn));

  // Undo/redo/clear (Steps 3–4).
  const undoBtn = makeButton("Undo");
  const redoBtn = makeButton("Redo");
  const clearBtn = makeButton("Clear");
  undoRedoRow.append(undoBtn, redoBtn, clearBtn);

  clearBtn.addEventListener("click", () => {
    displayList.length = 0;
    redoStack.length = 0;
    canvas.dispatchEvent(new Event("drawing-changed"));
  });

  // Redraw observer (display list + optional preview on top).
  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const cmd of displayList) cmd.display(ctx);
    if (!cursor.active && previewCmd?.visible()) previewCmd.display(ctx);
  };

  // Control state updater.
  const updateControls = () => {
    undoBtn.disabled = displayList.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  };

  // Unified observer handler.
  const onAnyChange = () => {
    redraw();
    updateControls();
  };
  canvas.addEventListener("drawing-changed", onAnyChange);
  canvas.addEventListener("tool-moved", onAnyChange);

  // Preview selection swaps based on active tool.
  function setPreviewForCurrentTool() {
    previewCmd = (currentToolMode === "marker")
      ? createMarkerPreview(() => currentStrokeStyle, () => currentLineWidth)
      : createStickerPreview(() => currentSticker, () => currentStickerPx);
  }

  // Pointer → build commands (marker stroke or sticker) and notify observers.
  let currentCmd: DraggableCommand | null = null;

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    cursor.active = true;
    cursor.x = e.offsetX;
    cursor.y = e.offsetY;
    previewCmd?.hide();

    if (redoStack.length) redoStack.length = 0; // new edit kills redo

    currentCmd = (currentToolMode === "marker")
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
    e.preventDefault();
  });

  canvas.addEventListener("mousemove", (e: MouseEvent) => {
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
  });

  function endStroke() {
    cursor.active = false;
    currentCmd = null;
    previewCmd?.set(cursor.x, cursor.y);
    previewCmd?.show();
    canvas.dispatchEvent(new Event("tool-moved"));
  }
  canvas.addEventListener("mouseup", endStroke);
  canvas.addEventListener("mouseleave", () => {
    previewCmd?.hide();
    canvas.dispatchEvent(new Event("tool-moved"));
    endStroke();
  });

  // Undo/Redo actions operate on command stacks.
  function undo() {
    if (!displayList.length) return;
    const popped = displayList.pop()!;
    redoStack.push(popped);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
  function redo() {
    if (!redoStack.length) return;
    const restored = redoStack.pop()!;
    displayList.push(restored);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  // Keyboard shortcuts (Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z).
  globalThis.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key.toLowerCase() === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }
  });

  // Initial tool UI & preview
  renderStickerButtons();
  setMarkerTool(2, thinBtn);
  canvas.dispatchEvent(new Event("tool-moved"));
}

initUI();
