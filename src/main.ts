import "./style.css";

type Point = { x: number; y: number };
type Stroke = Point[];

const displayList: Stroke[] = [];

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

function initUI(): void {
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
  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const clearButton = document.createElement("button");
  clearButton.innerHTML = "Clear";
  clearButton.style.marginTop = "10px";
  clearButton.style.padding = "6px 12px";
  clearButton.style.fontSize = "14px";
  clearButton.style.cursor = "pointer";
  app.appendChild(clearButton);

  clearButton.addEventListener("click", () => {
    displayList.length = 0;
    canvas.dispatchEvent(new Event("drawing-changed"));
  });

  const redraw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of displayList) {
      if (stroke.length === 0) continue;

      if (stroke.length === 1) {
        const p = stroke[0]!;
        ctx.beginPath();
        ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        continue;
      }

      const first = stroke[0]!;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < stroke.length; i++) {
        const pt = stroke[i]!;
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  };

  canvas.addEventListener("drawing-changed", redraw);

  let currentStroke: Stroke | null = null;

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    cursor.active = true;
    cursor.x = e.offsetX;
    cursor.y = e.offsetY;

    currentStroke = [{ x: cursor.x, y: cursor.y }];
    displayList.push(currentStroke);

    canvas.dispatchEvent(new Event("drawing-changed"));
    e.preventDefault();
  });

  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    if (!cursor.active || !currentStroke) return;

    cursor.x = e.offsetX;
    cursor.y = e.offsetY;

    currentStroke.push({ x: cursor.x, y: cursor.y });
    canvas.dispatchEvent(new Event("drawing-changed"));
  });

  function endStroke() {
    cursor.active = false;
    currentStroke = null;
  }

  canvas.addEventListener("mouseup", endStroke);
  canvas.addEventListener("mouseleave", endStroke);

  canvas.dispatchEvent(new Event("drawing-changed"));
}

initUI();
