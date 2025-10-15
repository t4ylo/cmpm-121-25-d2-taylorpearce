import "./style.css";

type Cursor = { active: boolean; x: number; y: number };
const cursor: Cursor = { active: false, x: 0, y: 0 };

function createAppTitle(titleText: string): HTMLElement {
  const title = document.createElement("h1");
  title.textContent = titleText;
  return title;
}

function createDrawingCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.id = "drawingCanvas";
  canvas.style.border = "1px solid #ccc";
  return canvas;
}

function initUI(): void {
  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);

  const title = createAppTitle("Sticker Sketchpad");
  const canvas = createDrawingCanvas(256, 256);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context");

  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;

  app.appendChild(title);
  app.appendChild(canvas);

  
  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    cursor.active = true;
    cursor.x = e.offsetX;
    cursor.y = e.offsetY;
  });

  canvas.addEventListener("mouseup", () => {
    cursor.active = false;
  });

  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    if (!cursor.active) return;

    ctx.beginPath();
    ctx.moveTo(cursor.x, cursor.y);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();

    
    cursor.x = e.offsetX;
    cursor.y = e.offsetY;
  });

  const clearButton = document.createElement("button");
      clearButton.innerHTML = "clear";
      document.body.append(clearButton);

      clearButton.addEventListener("click", () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      });

}

initUI();

