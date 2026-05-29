const SOURCE_FORMAT = "cross-stitch-pattern-project";
const VIEWER_FORMAT = "cross-stitch-work-viewer";
const VIEWER_VERSION = 1;
const FRAGMENT_SIZE = 50;
const DISPLAY_SCALE = 1.75;
const ZOOM_STEP = 2;
const WHEEL_ZOOM_STEP = 1;
const SYMBOLS = "●■▲◆✚✦✧★☆○□△◇×+*/#%@&$!?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");

const els = {
  app: document.querySelector("#app"),
  fileButton: document.querySelector("#fileButton"),
  fileInput: document.querySelector("#fileInput"),
  panelCloseButton: document.querySelector("#panelCloseButton"),
  toolbarImportButton: document.querySelector("#toolbarImportButton"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  overviewMode: document.querySelector("#overviewMode"),
  fragmentMode: document.querySelector("#fragmentMode"),
  symbolsInput: document.querySelector("#symbolsInput"),
  gridInput: document.querySelector("#gridInput"),
  stitchedInput: document.querySelector("#stitchedInput"),
  onlyColorInput: document.querySelector("#onlyColorInput"),
  colorSelect: document.querySelector("#colorSelect"),
  zoomInput: document.querySelector("#zoomInput"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomIn: document.querySelector("#zoomIn"),
  resetFragmentButton: document.querySelector("#resetFragmentButton"),
  resetFragmentMarksButton: document.querySelector("#resetFragmentMarksButton"),
  exportButton: document.querySelector("#exportButton"),
  status: document.querySelector("#status"),
  canvasShell: document.querySelector("#canvasShell"),
  canvasStage: document.querySelector("#canvasStage"),
  canvas: document.querySelector("#patternCanvas"),
  mapCanvas: document.querySelector("#mapCanvas"),
  fragmentGrid: document.querySelector("#fragmentGrid"),
  emptyState: document.querySelector("#emptyState"),
  cellSwatch: document.querySelector("#cellSwatch"),
  cellTitle: document.querySelector("#cellTitle"),
  cellDetails: document.querySelector("#cellDetails"),
  sizeStat: document.querySelector("#sizeStat"),
  fragmentStat: document.querySelector("#fragmentStat"),
  stitchedStat: document.querySelector("#stitchedStat")
};

const ctx = els.canvas.getContext("2d");
const mapCtx = els.mapCanvas.getContext("2d");

let project = null;
let mode = "overview";
let selectedFragment = 0;
let selectedCell = -1;
let selectedColor = "";
let stitched = new Set();
let showStitched = true;
let paintValue = true;
let isPainting = false;
let dragState = null;
const activeTouches = new Map();
let touchGesture = null;
let viewOffsetX = 0;
let viewOffsetY = 0;

els.fileInput.addEventListener("change", importFile);
els.fileButton.addEventListener("click", openFilePicker);
els.panelCloseButton.addEventListener("click", closeSidebar);
els.toolbarImportButton.addEventListener("click", openFilePicker);
els.sidebarToggle.addEventListener("click", toggleSidebar);
els.overviewMode.addEventListener("click", () => setMode("overview"));
els.fragmentMode.addEventListener("click", () => setMode("fragment"));
els.symbolsInput.addEventListener("change", draw);
els.gridInput.addEventListener("change", draw);
els.onlyColorInput.addEventListener("change", draw);
els.stitchedInput.addEventListener("change", () => {
  stopPaint();
  stopNavigation();
  draw();
});
els.colorSelect.addEventListener("change", () => {
  selectedColor = els.colorSelect.value;
  draw();
});
els.zoomInput.addEventListener("input", draw);
els.zoomOut.addEventListener("click", () => stepZoom(-ZOOM_STEP));
els.zoomIn.addEventListener("click", () => stepZoom(ZOOM_STEP));
els.resetFragmentButton.addEventListener("click", toggleStitchedVisibility);
els.resetFragmentMarksButton.addEventListener("click", resetCurrentFragmentMarks);
els.exportButton.addEventListener("click", exportWork);
els.canvas.addEventListener("pointerdown", startPaint);
els.canvas.addEventListener("pointermove", continuePaint);
els.canvas.addEventListener("pointerleave", stopPaint);
window.addEventListener("pointerup", stopPaint);
els.canvasShell.addEventListener("wheel", handleWheelZoom, { passive: false });
els.canvas.addEventListener("pointerdown", startNavigation);
els.canvas.addEventListener("pointermove", continueNavigation);
els.canvas.addEventListener("pointerleave", stopNavigation);
window.addEventListener("pointerup", stopNavigation);
window.addEventListener("resize", applyViewOffset);
els.canvasShell.addEventListener("touchstart", startTouchNavigation, { passive: false });
els.canvasShell.addEventListener("touchmove", continueTouchNavigation, { passive: false });
els.canvasShell.addEventListener("touchend", stopTouchNavigation, { passive: false });
els.canvasShell.addEventListener("touchcancel", stopTouchNavigation, { passive: false });
els.mapCanvas.addEventListener("click", selectFragmentFromMap);

initMobileLayout();
renderEmptyMap();

function openFilePicker() {
  if (window.AndroidBridge && typeof window.AndroidBridge.openJsonPicker === "function") {
    window.AndroidBridge.openJsonPicker();
    return;
  }
  els.fileInput.click();
}

function initMobileLayout() {
  if (!window.matchMedia("(max-width: 820px)").matches) return;
  els.app.classList.add("sidebarClosed");
  els.sidebarToggle.textContent = "Панель";
}

function closeSidebar() {
  if (els.app.classList.contains("sidebarClosed")) return;
  toggleSidebar();
}

function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      importJsonText(file.name, String(reader.result));
    } catch (error) {
      showImportError(error);
    } finally {
      els.fileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function importJsonText(fileName, text) {
  const data = JSON.parse(text);
  if (data.format === VIEWER_FORMAT) {
    restoreViewerFile(data);
  } else {
    restoreSourceProject(data);
  }
  els.status.textContent = fileName || "JSON импортирован";
  els.emptyState.style.display = "none";
  els.exportButton.disabled = false;
  els.resetFragmentButton.disabled = false;
  els.resetFragmentMarksButton.disabled = false;
  renderAll();
}

function showImportError(error) {
  console.error(error);
  alert("Не удалось импортировать файл. Нужен JSON проекта или рабочий JSON просмотрщика.");
  els.status.textContent = "Ошибка импорта";
}

window.importJsonFromAndroid = (fileName, text) => {
  try {
    importJsonText(fileName, text);
  } catch (error) {
    showImportError(error);
  }
};

window.importPickedJsonFromAndroid = () => {
  try {
    const fileName = window.AndroidBridge.consumePickedJsonName();
    const text = window.AndroidBridge.consumePickedJsonText();
    importJsonText(fileName, text);
  } catch (error) {
    showImportError(error);
  }
};

window.cancelJsonImportFromAndroid = () => {
  els.status.textContent = "Импорт отменен";
};

function restoreViewerFile(data) {
  restoreSourceProject(data.project);
  selectedFragment = clamp(parseInt(data.selectedFragment, 10) || 0, 0, fragmentCount() - 1);
  selectedCell = Number.isInteger(data.selectedCell) ? data.selectedCell : -1;
  selectedColor = String(data.selectedColor || "");
  stitched = new Set(Array.isArray(data.stitched) ? data.stitched.filter(validCellIndex) : []);
  mode = data.mode === "fragment" ? "fragment" : "overview";
  if (data.settings) {
    els.symbolsInput.checked = data.settings.showSymbols !== false;
    els.gridInput.checked = data.settings.showGrid !== false;
    els.stitchedInput.checked = data.settings.markMode === true;
    showStitched = data.settings.showStitched !== false;
    updateStitchedVisibilityButton();
    els.onlyColorInput.checked = data.settings.onlyColor === true;
    els.zoomInput.value = String(clamp(parseInt(data.settings.cellSize, 10) || 18, 6, 42));
  }
}

function restoreSourceProject(data) {
  if (!data || data.format !== SOURCE_FORMAT) throw new Error("Unsupported format");
  const width = parseInt(data.width, 10);
  const height = parseInt(data.height, 10);
  const palette = Array.isArray(data.palette) ? data.palette.map(normalizePaletteEntry) : [];
  const stitchesData = Array.isArray(data.stitches) ? data.stitches.map((item) => parseInt(item, 10)) : [];

  if (!width || !height || width < 1 || height < 1) throw new Error("Invalid size");
  if (!palette.length || stitchesData.length !== width * height) throw new Error("Invalid pattern");
  stitchesData.forEach((idx) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= palette.length) throw new Error("Invalid stitch");
  });

  project = {
    format: SOURCE_FORMAT,
    version: data.version || 1,
    width,
    height,
    fabricCount: parseInt(data.fabricCount, 10) || 14,
    palette,
    stitches: stitchesData
  };
  selectedFragment = 0;
  selectedCell = -1;
  selectedColor = palette[0] ? "0" : "";
  stitched = new Set();
  showStitched = true;
  els.stitchedInput.checked = false;
  updateStitchedVisibilityButton();
}

function normalizePaletteEntry(item) {
  const threads = Array.isArray(item.threads) && item.threads.length
    ? item.threads.map(normalizeThread)
    : [normalizeThread(item)];
  if (item.kind === "blend") {
    const a = threads[0];
    const b = threads[1] || threads[0];
    return {
      kind: "blend",
      code: `${a.code}+${b.code}`,
      name: `${a.name} + ${b.name}`,
      r: Math.round((a.r + b.r) / 2),
      g: Math.round((a.g + b.g) / 2),
      b: Math.round((a.b + b.b) / 2),
      threads: [a, b]
    };
  }
  return {
    kind: "single",
    code: threads[0].code,
    name: threads[0].name,
    r: threads[0].r,
    g: threads[0].g,
    b: threads[0].b,
    threads: [threads[0]]
  };
}

function normalizeThread(item) {
  return {
    code: String(item && item.code ? item.code : ""),
    name: String(item && item.name ? item.name : item && item.code ? item.code : ""),
    r: clamp(parseInt(item && item.r, 10) || 0, 0, 255),
    g: clamp(parseInt(item && item.g, 10) || 0, 0, 255),
    b: clamp(parseInt(item && item.b, 10) || 0, 0, 255)
  };
}

function renderAll() {
  renderPalette();
  renderFragments();
  renderModeButtons();
  updateStitchedVisibilityButton();
  updateStats();
  updateSelectedCellInfo();
  draw();
}

function renderPalette() {
  els.colorSelect.innerHTML = "";
  if (!project) return;
  project.palette.forEach((thread, idx) => {
    const option = document.createElement("option");
    option.value = String(idx);
    option.textContent = `${symbolFor(idx)}  DMC ${thread.code} - ${thread.name}`;
    els.colorSelect.appendChild(option);
  });
  if (!validPaletteIndex(Number(selectedColor))) selectedColor = "0";
  els.colorSelect.value = selectedColor;
}

function renderFragments() {
  els.fragmentGrid.innerHTML = "";
  if (!project) {
    renderEmptyMap();
    return;
  }

  for (let index = 0; index < fragmentCount(); index++) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(index + 1);
    button.classList.toggle("active", index === selectedFragment);
    button.title = fragmentTitle(index);
    button.addEventListener("click", () => {
      selectedFragment = index;
      setMode("fragment");
    });
    els.fragmentGrid.appendChild(button);
  }
  drawMap();
}

function renderModeButtons() {
  els.overviewMode.classList.toggle("active", mode === "overview");
  els.fragmentMode.classList.toggle("active", mode === "fragment");
}

function setMode(nextMode) {
  if (!project) return;
  mode = nextMode;
  renderFragments();
  renderModeButtons();
  updateStats();
  draw();
}

function toggleSidebar() {
  const closed = els.app.classList.toggle("sidebarClosed");
  els.sidebarToggle.textContent = closed
    ? (window.matchMedia("(max-width: 820px)").matches ? "Панель" : "Показать панель")
    : "Скрыть панель";
  if (!project) return;

  requestAnimationFrame(() => {
    draw();
    applyViewOffset();
  });
}

function stepZoom(delta) {
  els.zoomInput.value = String(clamp(parseInt(els.zoomInput.value, 10) + delta, 6, 42));
  draw();
}

function toggleStitchedVisibility() {
  if (!project) return;
  showStitched = !showStitched;
  updateStitchedVisibilityButton();
  draw();
}

function updateStitchedVisibilityButton() {
  els.resetFragmentButton.textContent = showStitched ? "Скрыть отшивку" : "Показать отшивку";
}

function resetCurrentFragmentMarks() {
  if (!project) return;
  const area = fragmentArea(selectedFragment);
  let removed = 0;

  for (let y = area.startY; y < area.endY; y++) {
    for (let x = area.startX; x < area.endX; x++) {
      const index = y * project.width + x;
      if (stitched.delete(index)) removed++;
    }
  }

  if (!removed) {
    els.status.textContent = `Во фрагменте ${selectedFragment + 1} нет отметок`;
    return;
  }

  if (validCellIndex(selectedCell)) {
    const x = selectedCell % project.width;
    const y = Math.floor(selectedCell / project.width);
    if (x >= area.startX && x < area.endX && y >= area.startY && y < area.endY) {
      updateSelectedCellInfo();
    }
  }
  els.status.textContent = `Сброшено отметок: ${removed}`;
  draw();
}

function draw() {
  if (!project) return;

  const cell = currentCellSize();
  const area = mode === "overview" ? overviewArea() : fragmentArea(selectedFragment);
  const margin = mode === "overview" ? 32 : 40;
  const width = area.width * cell + margin;
  const height = area.height * cell + margin;

  els.canvas.width = width;
  els.canvas.height = height;
  updateCanvasStageSize(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  drawRulers(area, cell, margin);
  drawCells(area, cell, margin);
  if (els.gridInput.checked) drawGrid(area, cell, margin);
  drawInnerCoordinates(area, cell, margin);
  drawSelection(area, cell, margin);
  updateStats();
  drawMap();
}

function updateCanvasStageSize(width, height) {
  const styles = getComputedStyle(els.canvasStage);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  els.canvasStage.style.width = `${Math.ceil(width + horizontalPadding)}px`;
  els.canvasStage.style.height = `${Math.ceil(height + verticalPadding)}px`;
  applyViewOffset();
}

function applyViewOffset() {
  const minX = Math.min(0, els.canvasShell.clientWidth - els.canvasStage.offsetWidth);
  const minY = Math.min(0, els.canvasShell.clientHeight - els.canvasStage.offsetHeight);
  viewOffsetX = clamp(viewOffsetX, minX, 0);
  viewOffsetY = clamp(viewOffsetY, minY, 0);
  els.canvasStage.style.transform = `translate(${viewOffsetX}px, ${viewOffsetY}px)`;
}

function drawCells(area, cell, margin) {
  const symbolsVisible = els.symbolsInput.checked && cell >= 11;
  const selectedPaletteIndex = Number(selectedColor);
  const onlyColor = els.onlyColorInput.checked && validPaletteIndex(selectedPaletteIndex);

  for (let y = area.startY; y < area.endY; y++) {
    for (let x = area.startX; x < area.endX; x++) {
      const globalIndex = y * project.width + x;
      const paletteIndex = project.stitches[globalIndex];
      const thread = project.palette[paletteIndex];
      const px = margin + (x - area.startX) * cell;
      const py = margin + (y - area.startY) * cell;
      const muted = onlyColor && paletteIndex !== selectedPaletteIndex;

      if (muted) {
        ctx.fillStyle = "#fbfbfb";
        ctx.fillRect(px, py, cell, cell);
      } else {
        ctx.fillStyle = rgb(thread);
        ctx.fillRect(px, py, cell, cell);
        if (thread.kind === "blend") drawBlendMark(px, py, cell, thread);
      }

      if (showStitched && stitched.has(globalIndex)) {
        drawStitchedMark(px, py, cell, muted);
      }

      if (symbolsVisible && !muted) {
        ctx.fillStyle = contrastColor(thread);
        ctx.font = `700 ${Math.max(8, Math.floor(cell * 0.56))}px Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(symbolFor(paletteIndex), px + cell / 2, py + cell / 2 + 0.5);
      }
    }
  }
}

function drawBlendMark(x, y, cell, thread) {
  const [a, b] = thread.threads;
  ctx.beginPath();
  ctx.moveTo(x + cell, y);
  ctx.lineTo(x + cell, y + cell);
  ctx.lineTo(x, y + cell);
  ctx.closePath();
  ctx.fillStyle = rgb(b);
  ctx.fill();
  ctx.fillStyle = `rgba(${a.r}, ${a.g}, ${a.b}, 0.34)`;
  ctx.fillRect(x, y, cell, cell);
}

function drawStitchedMark(x, y, cell, muted) {
  ctx.save();
  ctx.fillStyle = muted ? "rgba(255, 20, 147, 0.18)" : "rgba(255, 20, 147, 0.32)";
  ctx.fillRect(x, y, cell, cell);
  ctx.strokeStyle = "#ff1493";
  ctx.lineWidth = Math.max(3, cell * 0.14);
  ctx.beginPath();
  ctx.moveTo(x + cell * 0.24, y + cell * 0.56);
  ctx.lineTo(x + cell * 0.43, y + cell * 0.74);
  ctx.lineTo(x + cell * 0.78, y + cell * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawRulers(area, cell, margin) {
  ctx.fillStyle = "#f3efe8";
  ctx.fillRect(0, 0, els.canvas.width, margin);
  ctx.fillRect(0, 0, margin, els.canvas.height);
  ctx.fillStyle = "#5f5b55";
  ctx.font = "700 22px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let x = area.startX; x < area.endX; x++) {
    if (x === area.startX || (x + 1) % 10 === 0 || x + 1 === area.endX) {
      ctx.fillText(String(x + 1), margin + (x - area.startX) * cell + cell / 2, 20);
    }
  }
  for (let y = area.startY; y < area.endY; y++) {
    if (y === area.startY || (y + 1) % 10 === 0 || y + 1 === area.endY) {
      ctx.fillText(String(y + 1), 20, margin + (y - area.startY) * cell + cell / 2);
    }
  }
}

function drawGrid(area, cell, margin) {
  for (let x = area.startX; x <= area.endX; x++) {
    ctx.strokeStyle = x % 10 === 0 ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = x % 10 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(margin + (x - area.startX) * cell + 0.5, margin);
    ctx.lineTo(margin + (x - area.startX) * cell + 0.5, margin + area.height * cell);
    ctx.stroke();
  }
  for (let y = area.startY; y <= area.endY; y++) {
    ctx.strokeStyle = y % 10 === 0 ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = y % 10 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(margin, margin + (y - area.startY) * cell + 0.5);
    ctx.lineTo(margin + area.width * cell, margin + (y - area.startY) * cell + 0.5);
    ctx.stroke();
  }
}

function drawInnerCoordinates(area, cell, margin) {
  if (cell < 12) return;
  ctx.save();
  ctx.fillStyle = "#ff2400";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const fontSize = Math.max(10, Math.min(18, Math.floor(cell * 0.36)));
  const inset = Math.max(2, cell * 0.08);
  ctx.font = `800 ${fontSize}px Arial, sans-serif`;

  for (let y = nextTenEnd(area.startY); y < area.endY; y += 10) {
    for (let x = nextTenEnd(area.startX); x < area.endX; x += 10) {
      const px = margin + (x - area.startX + 1) * cell - cell + inset;
      const py = margin + (y - area.startY + 1) * cell - inset;
      drawReadableText(String(x + 1), px, py - fontSize - 1);
      drawReadableText(String(y + 1), px, py);
    }
  }

  ctx.restore();
}

function drawReadableText(text, x, y) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function nextTenEnd(value) {
  const remainder = (value + 1) % 10;
  return remainder === 0 ? value : value + (10 - remainder);
}

function drawSelection(area, cell, margin) {
  if (!validCellIndex(selectedCell)) return;
  const x = selectedCell % project.width;
  const y = Math.floor(selectedCell / project.width);
  if (x < area.startX || x >= area.endX || y < area.startY || y >= area.endY) return;

  ctx.strokeStyle = "#a33d34";
  ctx.lineWidth = Math.max(2, cell * 0.12);
  ctx.strokeRect(
    margin + (x - area.startX) * cell + 1,
    margin + (y - area.startY) * cell + 1,
    cell - 2,
    cell - 2
  );
}

function drawMap() {
  if (!project) {
    renderEmptyMap();
    return;
  }
  const w = els.mapCanvas.width;
  const h = els.mapCanvas.height;
  const scale = Math.min((w - 20) / project.width, (h - 20) / project.height);
  const drawnW = project.width * scale;
  const drawnH = project.height * scale;
  const ox = (w - drawnW) / 2;
  const oy = (h - drawnH) / 2;

  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = "#fff";
  mapCtx.fillRect(0, 0, w, h);

  for (let y = 0; y < project.height; y++) {
    for (let x = 0; x < project.width; x++) {
      const thread = project.palette[project.stitches[y * project.width + x]];
      mapCtx.fillStyle = rgb(thread);
      mapCtx.fillRect(ox + x * scale, oy + y * scale, Math.max(scale, 0.65), Math.max(scale, 0.65));
    }
  }

  for (let fy = 0; fy < fragmentsY(); fy++) {
    for (let fx = 0; fx < fragmentsX(); fx++) {
      const index = fy * fragmentsX() + fx;
      const area = fragmentArea(index);
      mapCtx.strokeStyle = index === selectedFragment ? "#a33d34" : "rgba(0, 0, 0, 0.42)";
      mapCtx.lineWidth = index === selectedFragment ? 3 : 1;
      mapCtx.strokeRect(
        ox + area.startX * scale,
        oy + area.startY * scale,
        area.width * scale,
        area.height * scale
      );
    }
  }
}

function renderEmptyMap() {
  mapCtx.clearRect(0, 0, els.mapCanvas.width, els.mapCanvas.height);
  mapCtx.fillStyle = "#fff";
  mapCtx.fillRect(0, 0, els.mapCanvas.width, els.mapCanvas.height);
  mapCtx.fillStyle = "#777";
  mapCtx.font = "13px Arial, sans-serif";
  mapCtx.textAlign = "center";
  mapCtx.fillText("Карта появится после импорта", els.mapCanvas.width / 2, els.mapCanvas.height / 2);
}

function selectFragmentFromMap(event) {
  if (!project) return;
  const rect = els.mapCanvas.getBoundingClientRect();
  const mx = (event.clientX - rect.left) * (els.mapCanvas.width / rect.width);
  const my = (event.clientY - rect.top) * (els.mapCanvas.height / rect.height);
  const scale = Math.min((els.mapCanvas.width - 20) / project.width, (els.mapCanvas.height - 20) / project.height);
  const ox = (els.mapCanvas.width - project.width * scale) / 2;
  const oy = (els.mapCanvas.height - project.height * scale) / 2;
  const x = Math.floor((mx - ox) / scale);
  const y = Math.floor((my - oy) / scale);
  if (x < 0 || y < 0 || x >= project.width || y >= project.height) return;
  selectedFragment = Math.floor(y / FRAGMENT_SIZE) * fragmentsX() + Math.floor(x / FRAGMENT_SIZE);
  setMode("fragment");
}

function startPaint(event) {
  if (!project || navigationEnabled()) return;
  const index = cellFromPointer(event);
  if (!validCellIndex(index)) return;
  selectedCell = index;
  syncColorSelectToCell(index);
  paintValue = !stitched.has(index);
  setStitched(index, paintValue);
  isPainting = true;
  els.canvas.setPointerCapture(event.pointerId);
  updateSelectedCellInfo();
  draw();
}

function continuePaint(event) {
  if (!project || !isPainting || navigationEnabled()) return;
  const index = cellFromPointer(event);
  if (!validCellIndex(index)) return;
  selectedCell = index;
  syncColorSelectToCell(index);
  setStitched(index, paintValue);
  updateSelectedCellInfo();
  draw();
}

function stopPaint() {
  isPainting = false;
}

function navigationEnabled() {
  return !els.stitchedInput.checked;
}

function startNavigation(event) {
  if (!project || !navigationEnabled() || event.pointerType === "touch") return;
  event.preventDefault();
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: viewOffsetX,
    offsetY: viewOffsetY
  };
  els.canvas.setPointerCapture(event.pointerId);
  els.canvas.classList.add("isPanning");
}

function continueNavigation(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  event.preventDefault();
  viewOffsetX = dragState.offsetX + (event.clientX - dragState.startX);
  viewOffsetY = dragState.offsetY + (event.clientY - dragState.startY);
  applyViewOffset();
}

function stopNavigation(event) {
  if (event && event.pointerType === "touch") return;
  if (event && dragState && event.pointerId !== dragState.pointerId) return;
  dragState = null;
  activeTouches.clear();
  touchGesture = null;
  els.canvas.classList.remove("isPanning");
}

function handleWheelZoom(event) {
  if (!project || !navigationEnabled()) return;
  event.preventDefault();
  const delta = event.deltaY < 0 ? WHEEL_ZOOM_STEP : -WHEEL_ZOOM_STEP;
  zoomAt(event.clientX, event.clientY, delta);
}

function startTouchNavigation(event) {
  if (!project || !navigationEnabled()) return;
  event.preventDefault();
  syncActiveTouches(event);
  if (activeTouches.size === 1) {
    const touch = firstActiveTouch();
    touchGesture = {
      type: "pan",
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: viewOffsetX,
      offsetY: viewOffsetY
    };
  } else if (activeTouches.size >= 2) {
    touchGesture = pinchGestureFromTouches();
  }
}

function continueTouchNavigation(event) {
  if (!project || !navigationEnabled() || !touchGesture) return;
  event.preventDefault();
  syncActiveTouches(event);
  if (touchGesture.type === "pan" && activeTouches.size === 1) {
    const touch = firstActiveTouch();
    viewOffsetX = touchGesture.offsetX + (touch.clientX - touchGesture.startX);
    viewOffsetY = touchGesture.offsetY + (touch.clientY - touchGesture.startY);
    applyViewOffset();
  } else if (touchGesture.type === "pinch" && activeTouches.size >= 2) {
    const current = pinchMetrics();
    if (!current || !touchGesture.distance) return;
    const nextZoom = clamp(Math.round(touchGesture.zoom * current.distance / touchGesture.distance), 6, 42);
    setZoomAt(current.centerX, current.centerY, nextZoom);
  }
}

function stopTouchNavigation(event) {
  if (!project || !navigationEnabled()) return;
  event.preventDefault();
  for (const touch of event.changedTouches) activeTouches.delete(touch.identifier);
  if (activeTouches.size === 1) {
    const touch = firstActiveTouch();
    touchGesture = {
      type: "pan",
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: viewOffsetX,
      offsetY: viewOffsetY
    };
  } else if (activeTouches.size >= 2) {
    touchGesture = pinchGestureFromTouches();
  } else {
    touchGesture = null;
  }
}

function syncActiveTouches(event) {
  for (const touch of event.touches) {
    activeTouches.set(touch.identifier, {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
  }
}

function firstActiveTouch() {
  return activeTouches.values().next().value;
}

function pinchGestureFromTouches() {
  const metrics = pinchMetrics();
  if (!metrics) return null;
  return {
    type: "pinch",
    distance: metrics.distance,
    zoom: parseInt(els.zoomInput.value, 10) || 18
  };
}

function pinchMetrics() {
  const touches = [...activeTouches.values()];
  if (touches.length < 2) return null;
  const a = touches[0];
  const b = touches[1];
  const dx = b.clientX - a.clientX;
  const dy = b.clientY - a.clientY;
  return {
    distance: Math.hypot(dx, dy),
    centerX: (a.clientX + b.clientX) / 2,
    centerY: (a.clientY + b.clientY) / 2
  };
}

function zoomAt(clientX, clientY, delta) {
  const currentZoom = parseInt(els.zoomInput.value, 10) || 18;
  setZoomAt(clientX, clientY, currentZoom + delta);
}

function setZoomAt(clientX, clientY, nextZoom) {
  const previousZoom = parseInt(els.zoomInput.value, 10) || 18;
  nextZoom = clamp(nextZoom, 6, 42);
  if (nextZoom === previousZoom) return;

  const shellRect = els.canvasShell.getBoundingClientRect();
  const focalX = clientX - shellRect.left - viewOffsetX;
  const focalY = clientY - shellRect.top - viewOffsetY;
  const ratio = nextZoom / previousZoom;

  els.zoomInput.value = String(nextZoom);
  draw();
  viewOffsetX = (clientX - shellRect.left) - focalX * ratio;
  viewOffsetY = (clientY - shellRect.top) - focalY * ratio;
  applyViewOffset();
}

function setStitched(index, value) {
  if (value) stitched.add(index);
  else stitched.delete(index);
}

function syncColorSelectToCell(index) {
  if (!project || !validCellIndex(index)) return;
  const paletteIndex = project.stitches[index];
  if (!validPaletteIndex(paletteIndex)) return;
  selectedColor = String(paletteIndex);
  els.colorSelect.value = selectedColor;
}

function cellFromPointer(event) {
  const rect = els.canvas.getBoundingClientRect();
  const cell = currentCellSize();
  const area = mode === "overview" ? overviewArea() : fragmentArea(selectedFragment);
  const margin = mode === "overview" ? 32 : 40;
  const x = Math.floor((event.clientX - rect.left - margin) / cell) + area.startX;
  const y = Math.floor((event.clientY - rect.top - margin) / cell) + area.startY;
  if (x < area.startX || x >= area.endX || y < area.startY || y >= area.endY) return -1;
  return y * project.width + x;
}

function updateSelectedCellInfo() {
  if (!project || !validCellIndex(selectedCell)) {
    els.cellSwatch.style.background = "#fff";
    els.cellTitle.textContent = "Не выбран";
    els.cellDetails.textContent = "Кликните по клетке схемы";
    return;
  }

  const x = selectedCell % project.width;
  const y = Math.floor(selectedCell / project.width);
  const paletteIndex = project.stitches[selectedCell];
  const thread = project.palette[paletteIndex];
  els.cellSwatch.style.cssText = swatchStyle(thread);
  els.cellTitle.textContent = `${symbolFor(paletteIndex)}  DMC ${thread.code}`;
  els.cellDetails.textContent = `${thread.name}; X ${x + 1}, Y ${y + 1}; ${stitched.has(selectedCell) ? "отшито" : "не отшито"}`;
}

function updateStats() {
  if (!project) return;
  const total = project.width * project.height;
  const area = fragmentArea(selectedFragment);
  els.sizeStat.textContent = `${project.width} x ${project.height}`;
  els.fragmentStat.textContent = mode === "overview"
    ? `вся схема, ${fragmentCount()} фр.`
    : `${selectedFragment + 1}: X ${area.startX + 1}-${area.endX}, Y ${area.startY + 1}-${area.endY}`;
  els.stitchedStat.textContent = `${stitched.size} / ${total}`;
}

function exportWork() {
  if (!project) return;
  const payload = {
    format: VIEWER_FORMAT,
    version: VIEWER_VERSION,
    exportedAt: new Date().toISOString(),
    fragmentSize: FRAGMENT_SIZE,
    fragments: {
      columns: fragmentsX(),
      rows: fragmentsY(),
      count: fragmentCount()
    },
    project,
    mode,
    selectedFragment,
    selectedCell,
    selectedColor,
    stitched: [...stitched].sort((a, b) => a - b),
    settings: {
      showSymbols: els.symbolsInput.checked,
      showGrid: els.gridInput.checked,
      showStitched,
      markMode: els.stitchedInput.checked,
      onlyColor: els.onlyColorInput.checked,
      cellSize: parseInt(els.zoomInput.value, 10)
    }
  };
  const json = JSON.stringify(payload, null, 2);
  if (window.AndroidBridge && typeof window.AndroidBridge.saveJson === "function") {
    window.AndroidBridge.saveJson("cross-stitch-work.json", json);
    els.status.textContent = "Работа сохранена";
    return;
  }
  downloadBlob(
    new Blob([json], { type: "application/json;charset=utf-8" }),
    "cross-stitch-work.json"
  );
}

function overviewArea() {
  return {
    startX: 0,
    startY: 0,
    endX: project.width,
    endY: project.height,
    width: project.width,
    height: project.height
  };
}

function fragmentArea(index) {
  const fx = index % fragmentsX();
  const fy = Math.floor(index / fragmentsX());
  const startX = fx * FRAGMENT_SIZE;
  const startY = fy * FRAGMENT_SIZE;
  const endX = Math.min(startX + FRAGMENT_SIZE, project.width);
  const endY = Math.min(startY + FRAGMENT_SIZE, project.height);
  return {
    startX,
    startY,
    endX,
    endY,
    width: endX - startX,
    height: endY - startY
  };
}

function overviewCellSize() {
  if (!project) return 2;
  const maxWidth = Math.max(360, els.canvasShell.clientWidth - 96);
  const maxHeight = Math.max(260, els.canvasShell.clientHeight - 96);
  return Math.max(1, Math.floor(Math.min(maxWidth / project.width, maxHeight / project.height, 8) * DISPLAY_SCALE));
}

function currentCellSize() {
  if (mode === "overview") return overviewCellSize();
  return (parseInt(els.zoomInput.value, 10) || 18) * DISPLAY_SCALE;
}

function fragmentsX() {
  return Math.ceil(project.width / FRAGMENT_SIZE);
}

function fragmentsY() {
  return Math.ceil(project.height / FRAGMENT_SIZE);
}

function fragmentCount() {
  return fragmentsX() * fragmentsY();
}

function fragmentTitle(index) {
  const area = fragmentArea(index);
  return `Фрагмент ${index + 1}: X ${area.startX + 1}-${area.endX}, Y ${area.startY + 1}-${area.endY}`;
}

function validCellIndex(index) {
  return project && Number.isInteger(index) && index >= 0 && index < project.width * project.height;
}

function validPaletteIndex(index) {
  return project && Number.isInteger(index) && index >= 0 && index < project.palette.length;
}

function symbolFor(index) {
  return SYMBOLS[index] || String(index + 1);
}

function contrastColor({ r, g, b }) {
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111" : "#fff";
}

function rgb(thread) {
  return `rgb(${thread.r}, ${thread.g}, ${thread.b})`;
}

function swatchStyle(thread) {
  if (thread.kind !== "blend") return `background: ${rgb(thread)}`;
  const [a, b] = thread.threads;
  return `background: linear-gradient(135deg, ${rgb(a)} 0 50%, ${rgb(b)} 50% 100%)`;
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
