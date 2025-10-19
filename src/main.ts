import "./style.css";

type Point = { x: number; y: number };

type DisplayCommand = {
  display(ctx: CanvasRenderingContext2D): void;
};

type DraggableCommand = DisplayCommand & {
  drag(x: number, y: number): void;
};

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

const displayList: DisplayCommand[] = [];
const redoStack: DisplayCommand[] = [];

const currentStrokeStyle = "black";
let currentLineWidth = 2;

type Cursor = { active: boolean; x: number; y: number };
const cursor: Cursor = { active: false, x: 0, y: 0 };

function createAppTitle(titleText: string): HTMLElement {
  const title = document.createElement("h1");
  title.textContent = titleText;
  title.style.textAlign = "center";
  title.style.fontFamily = "sans-serif";
  return title;
}

function createDrawingCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.id = "drawingCanvas";
  canvas.style.border = "1px solid #ccc";
  canvas.style.cursor = "crosshair";
  return canvas;
}

function makeButton(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.padding = "6px 12px";
  b.style.fontSize = "14px";
  b.style.cursor = "pointer";
  return b;
}

function initUI(): void {
  const style = document.createElement("style");
  style.textContent =
    `.selectedTool{outline:2px solid #111; outline-offset:2px; border-radius:6px}`;
  document.head.appendChild(style);

  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);

  app.style.display = "flex";
  app.style.flexDirection = "column";
  app.style.alignItems = "center";
  app.style.justifyContent = "center";
  app.style.gap = "10px";
  app.style.marginTop = "20px";

  const title = createAppTitle("Sticker Sketchpad");
  const canvas = createDrawingCanvas(256, 256);
  app.appendChild(title);
  app.appendChild(canvas);

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const toolRow = document.createElement("div");
  toolRow.style.display = "flex";
  toolRow.style.gap = "8px";
  toolRow.style.alignItems = "center";
  toolRow.style.justifyContent = "center";
  app.appendChild(toolRow);

  const undoRedoRow = document.createElement("div");
  undoRedoRow.style.display = "flex";
  undoRedoRow.style.gap = "8px";
  undoRedoRow.style.marginTop = "10px";
  undoRedoRow.style.alignItems = "center";
  undoRedoRow.style.justifyContent = "center";
  app.appendChild(undoRedoRow);

  const thinBtn = makeButton("Thin");
  const thickBtn = makeButton("Thick");
  toolRow.append(thinBtn, thickBtn);

  const setTool = (lineWidth: number, clicked: HTMLButtonElement) => {
    currentLineWidth = lineWidth;

    [thinBtn, thickBtn].forEach((b) => b.classList.remove("selectedTool"));
    clicked.classList.add("selectedTool");
  };

  setTool(2, thinBtn);
  thinBtn.addEventListener("click", () => setTool(2, thinBtn));
  thickBtn.addEventListener("click", () => setTool(8, thickBtn));

  const undoBtn = makeButton("Undo");
  const redoBtn = makeButton("Redo");
  const clearBtn = makeButton("Clear");
  undoRedoRow.append(undoBtn, redoBtn, clearBtn);

  clearBtn.addEventListener("click", () => {
    displayList.length = 0;
    redoStack.length = 0;
    canvas.dispatchEvent(new Event("drawing-changed"));
  });

  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const cmd of displayList) cmd.display(ctx);
  };

  const updateControls = () => {
    undoBtn.disabled = displayList.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  };

  const onDrawingChanged = () => {
    redraw();
    updateControls();
  };

  canvas.addEventListener("drawing-changed", onDrawingChanged);

  let currentStroke: DraggableCommand | null = null;

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    cursor.active = true;
    cursor.x = e.offsetX;
    cursor.y = e.offsetY;

    if (redoStack.length) redoStack.length = 0;

    currentStroke = createMarkerLine(
      { x: cursor.x, y: cursor.y },
      { strokeStyle: currentStrokeStyle, lineWidth: currentLineWidth },
    );
    displayList.push(currentStroke);

    canvas.dispatchEvent(new Event("drawing-changed"));
    e.preventDefault();
  });

  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    if (!cursor.active || !currentStroke) return;

    cursor.x = e.offsetX;
    cursor.y = e.offsetY;

    currentStroke.drag(cursor.x, cursor.y);
    canvas.dispatchEvent(new Event("drawing-changed"));
  });

  function endStroke() {
    cursor.active = false;
    currentStroke = null;
  }
  canvas.addEventListener("mouseup", endStroke);
  canvas.addEventListener("mouseleave", endStroke);

  function undo() {
    if (displayList.length === 0) return;
    const popped = displayList.pop()!;
    redoStack.push(popped);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }

  function redo() {
    if (redoStack.length === 0) return;
    const restored = redoStack.pop()!;
    displayList.push(restored);
    canvas.dispatchEvent(new Event("drawing-changed"));
  }

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

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

  canvas.dispatchEvent(new Event("drawing-changed"));
}

initUI();
