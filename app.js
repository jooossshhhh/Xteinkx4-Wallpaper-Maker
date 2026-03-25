/**
 * Client-side wallpaper pipeline for Xteink X4. Exports 24-bit BMP only.
 * Portrait 480×800 or landscape 800×480.
 */
(() => {
  /** @type {Record<string, HTMLElement | null>} */
  const $ = {
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("file-input"),
    orientation: document.getElementById("orientation"),
    introDims: document.getElementById("intro-dims"),
    fitMode: document.getElementById("fit-mode"),
    scale: document.getElementById("scale"),
    scaleVal: document.getElementById("scale-val"),
    offsetX: document.getElementById("offset-x"),
    offsetY: document.getElementById("offset-y"),
    offsetXVal: document.getElementById("offset-x-val"),
    offsetYVal: document.getElementById("offset-y-val"),
    eink: document.getElementById("eink"),
    dither: document.getElementById("dither"),
    thumbList: document.getElementById("thumb-list"),
    previewImg: document.getElementById("preview-img"),
    emptyStage: document.getElementById("empty-stage"),
    downloadBmp: document.getElementById("download-bmp"),
    resetTransform: document.getElementById("reset-transform"),
    previewBezel: document.getElementById("preview-bezel"),
    panHint: document.getElementById("pan-hint"),
    specPill: document.getElementById("spec-pill"),
    clearQueue: document.getElementById("clear-queue"),
    duplicateActive: document.getElementById("duplicate-active"),
  };

  const outCanvas = document.createElement("canvas");
  outCanvas.width = 480;
  outCanvas.height = 800;
  const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });

  /** @type {{ id: string, name: string, img: HTMLImageElement }[]} */
  let items = [];
  /** @type {string | null} */
  let activeId = null;

  let previewObjectUrl = /** @type {string | null} */ (null);
  let previewGen = 0;
  let compositeRaf = 0;

  const BAYER_4x4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  /**
   * @type {{ canPanX: boolean, canPanY: boolean, halfSlideX: number, halfSlideY: number }}
   */
  let layoutForPan = {
    canPanX: false,
    canPanY: false,
    halfSlideX: 0,
    halfSlideY: 0,
  };

  let previewDragPointerId = /** @type {number | null} */ (null);
  let previewDragLastX = 0;
  let previewDragLastY = 0;

  function isLandscape() {
    return $.orientation?.value === "landscape";
  }

  function syncCanvasDimensions() {
    const landscape = isLandscape();
    const w = landscape ? 800 : 480;
    const h = landscape ? 480 : 800;
    if (outCanvas.width !== w || outCanvas.height !== h) {
      outCanvas.width = w;
      outCanvas.height = h;
    }
    $.previewBezel?.classList.toggle("device-bezel--landscape", landscape);
    $.previewImg.width = w;
    $.previewImg.height = h;
    if ($.introDims) {
      $.introDims.textContent = `${w}\u00d7${h}`;
    }
    if ($.specPill) {
      $.specPill.textContent = `Preview ${w} \u00d7 ${h} \u00b7 No data sent to a server`;
    }
  }

  function outW() {
    return outCanvas.width;
  }

  function outH() {
    return outCanvas.height;
  }

  /**
   * @param {{ img: HTMLImageElement }} item
   * @param {string} fit
   * @param {number} scalePct
   */
  function computeDrawSize(item, fit, scalePct) {
    const W = outW();
    const H = outH();
    const iw = item.img.naturalWidth;
    const ih = item.img.naturalHeight;
    if (fit === "stretch") {
      return { dw: W, dh: H };
    }
    if (fit === "cover") {
      const s = Math.max(W / iw, H / ih) * scalePct;
      return { dw: iw * s, dh: ih * s };
    }
    const s = Math.min(W / iw, H / ih) * scalePct;
    return { dw: iw * s, dh: ih * s };
  }

  function refreshLayoutForPan(item, fit, scalePct) {
    if (!item || fit === "stretch") {
      layoutForPan = {
        canPanX: false,
        canPanY: false,
        halfSlideX: 0,
        halfSlideY: 0,
      };
      return;
    }
    const { dw, dh } = computeDrawSize(item, fit, scalePct);
    const W = outW();
    const H = outH();
    const hx = Math.abs(dw - W) / 2;
    const hy = Math.abs(dh - H) / 2;
    layoutForPan = {
      canPanX: hx > 0.5,
      canPanY: hy > 0.5,
      halfSlideX: hx,
      halfSlideY: hy,
    };
  }

  function previewCanvasScaleFactor() {
    const bezel = $.previewBezel?.getBoundingClientRect();
    if (!bezel?.width || !bezel.height) return 1;
    return Math.min(bezel.width / outW(), bezel.height / outH());
  }

  function makeId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /** @param {File} file */
  function shouldTryDecodeAsImage(file) {
    if (file.type.startsWith("image/")) return true;
    if (file.type === "") return true;
    return /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif)$/i.test(file.name);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image"));
      };
      img.src = url;
    });
  }

  function revokePreviewObjectUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  function invalidatePreviewGeneration() {
    previewGen += 1;
  }

  function queuePreviewUpdate() {
    const gen = ++previewGen;
    outCanvas.toBlob(
      (blob) => {
        if (gen !== previewGen || !blob) return;
        revokePreviewObjectUrl();
        previewObjectUrl = URL.createObjectURL(blob);
        $.previewImg.src = previewObjectUrl;
      },
      "image/png",
      0.92
    );
  }

  function updateQueueActionButtons() {
    if ($.clearQueue) $.clearQueue.disabled = items.length === 0;
    if ($.duplicateActive) {
      $.duplicateActive.disabled = !getActiveItem();
    }
  }

  async function addFiles(fileList) {
    const files = [...fileList].filter(shouldTryDecodeAsImage);
    if (!files.length) return;

    const settled = await Promise.allSettled(
      files.map(async (file) => {
        const img = await loadImage(file);
        return { id: makeId(), name: file.name, img };
      })
    );

    /** @type {{ id: string, name: string, img: HTMLImageElement }[]} */
    const newItems = [];
    for (const r of settled) {
      if (r.status === "fulfilled") newItems.push(r.value);
      else console.warn("Skipped a file:", r.reason);
    }
    if (!newItems.length) return;

    items = items.concat(newItems);
    if (!activeId) activeId = newItems[0].id;
    renderThumbs();
    composite();
  }

  function removeItem(id) {
    const wasActive = activeId === id;
    items = items.filter((i) => i.id !== id);
    if (wasActive) {
      activeId = items[0]?.id ?? null;
    }
    renderThumbs();
    composite();
  }

  function clearQueue() {
    invalidatePreviewGeneration();
    revokePreviewObjectUrl();
    items = [];
    activeId = null;
    renderThumbs();
    composite();
  }

  function duplicateActiveItem() {
    const item = getActiveItem();
    if (!item) return;
    const name = /\.[^/.]+$/.test(item.name)
      ? item.name.replace(/(\.[^/.]+)$/, " (copy)$1")
      : `${item.name} (copy)`;
    items.push({
      id: makeId(),
      name,
      img: item.img,
    });
    activeId = items[items.length - 1].id;
    renderThumbs();
    composite();
  }

  function renderThumbs() {
    $.thumbList.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "thumb-row";

      const btn = document.createElement("button");
      btn.type = "button";
      const isActive = item.id === activeId;
      btn.className = "thumb" + (isActive ? " active" : "");
      if (isActive) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
      const thumb = document.createElement("img");
      thumb.src = item.img.src;
      thumb.alt = "";
      const span = document.createElement("span");
      span.textContent = item.name;
      btn.append(thumb, span);
      btn.addEventListener("click", () => {
        activeId = item.id;
        renderThumbs();
        composite();
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "thumb-remove";
      removeBtn.setAttribute("aria-label", `Remove ${item.name} from queue`);
      removeBtn.title = "Remove from queue";
      removeBtn.textContent = "\u00d7";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeItem(item.id);
      });

      row.append(btn, removeBtn);
      $.thumbList.appendChild(row);
    }
    updateQueueActionButtons();
  }

  function getActiveItem() {
    return items.find((i) => i.id === activeId) ?? null;
  }

  function orderedDitherGray(imageData) {
    const d = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const t = (BAYER_4x4[y & 3][x & 3] / 16) * 255;
        gray = gray >= t ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
    }
    return imageData;
  }

  function applyEinkPipeline(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(
        0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      );
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
    outCtx.putImageData(imageData, 0, 0);
    if ($.dither.checked) {
      const layer = outCtx.getImageData(0, 0, outW(), outH());
      orderedDitherGray(layer);
      outCtx.putImageData(layer, 0, 0);
    }
  }

  function drawSourceToOutput(item) {
    const fit = $.fitMode.value;
    const scalePct = Number($.scale.value) / 100;
    const panX = Number($.offsetX.value) / 100;
    const panY = Number($.offsetY.value) / 100;

    const W = outW();
    const H = outH();

    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, W, H);

    outCtx.save();
    if (fit === "stretch") {
      outCtx.translate(W / 2, H / 2);
      outCtx.scale(scalePct, scalePct);
      outCtx.translate(-W / 2, -H / 2);
      outCtx.drawImage(item.img, 0, 0, W, H);
    } else {
      const { dw, dh } = computeDrawSize(item, fit, scalePct);
      const halfSlideX = Math.abs(dw - W) / 2;
      const halfSlideY = Math.abs(dh - H) / 2;
      const dx = (W - dw) / 2 + panX * halfSlideX;
      const dy = (H - dh) / 2 + panY * halfSlideY;
      outCtx.drawImage(item.img, dx, dy, dw, dh);
    }
    outCtx.restore();

    if ($.eink.checked) {
      const layer = outCtx.getImageData(0, 0, W, H);
      applyEinkPipeline(layer);
    }
  }

  function renderOutputToCanvas(item) {
    syncCanvasDimensions();
    drawSourceToOutput(item);
  }

  function composite() {
    if (compositeRaf) {
      cancelAnimationFrame(compositeRaf);
      compositeRaf = 0;
    }

    syncCanvasDimensions();

    const item = getActiveItem();
    $.downloadBmp.disabled = !item;

    if (!item) {
      invalidatePreviewGeneration();
      revokePreviewObjectUrl();
      $.previewImg.removeAttribute("src");
      $.previewImg.style.display = "none";
      $.previewImg.setAttribute("hidden", "");
      $.emptyStage.hidden = false;
      $.previewBezel?.classList.remove("preview-pannable", "preview-dragging");
      if ($.panHint) $.panHint.hidden = true;
      updateQueueActionButtons();
      return;
    }

    $.emptyStage.hidden = true;
    $.previewImg.removeAttribute("hidden");
    $.previewImg.style.display = "block";

    const fit = $.fitMode.value;
    const scalePct = Number($.scale.value) / 100;
    refreshLayoutForPan(item, fit, scalePct);

    const pannable =
      fit !== "stretch" &&
      (layoutForPan.canPanX || layoutForPan.canPanY);
    $.previewBezel?.classList.toggle("preview-pannable", pannable);
    if ($.panHint) $.panHint.hidden = fit === "stretch";

    renderOutputToCanvas(item);
    queuePreviewUpdate();
    updateQueueActionButtons();
  }

  function requestComposite() {
    if (compositeRaf) return;
    compositeRaf = requestAnimationFrame(() => {
      compositeRaf = 0;
      composite();
    });
  }

  /**
   * Windows BMP: 24-bit BI_RGB, bottom-up rows, BGR, row padding to 4 bytes.
   * @param {HTMLCanvasElement} sourceCanvas
   * @returns {Blob}
   */
  function canvasToBmp24Blob(sourceCanvas) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const c = sourceCanvas.getContext("2d");
    if (!c) throw new Error("No 2d context");
    const { data: src } = c.getImageData(0, 0, w, h);
    const rowSize = Math.ceil((w * 3) / 4) * 4;
    const pixelBytes = rowSize * h;
    const fileSize = 14 + 40 + pixelBytes;
    const buf = new ArrayBuffer(fileSize);
    const view = new DataView(buf);
    let o = 0;
    view.setUint8(o++, 0x42);
    view.setUint8(o++, 0x4d);
    view.setUint32(o, fileSize, true);
    o += 4;
    view.setUint32(o, 0, true);
    o += 4;
    view.setUint32(o, 54, true);
    o += 4;
    view.setUint32(o, 40, true);
    o += 4;
    view.setInt32(o, w, true);
    o += 4;
    view.setInt32(o, h, true);
    o += 4;
    view.setUint16(o, 1, true);
    o += 2;
    view.setUint16(o, 24, true);
    o += 2;
    view.setUint32(o, 0, true);
    o += 4;
    view.setUint32(o, pixelBytes, true);
    o += 4;
    view.setUint32(o, 2835, true);
    o += 4;
    view.setUint32(o, 2835, true);
    o += 4;
    view.setUint32(o, 0, true);
    o += 4;
    view.setUint32(o, 0, true);
    o += 4;

    const bytes = new Uint8Array(buf);
    let p = 54;
    for (let row = 0; row < h; row++) {
      const rowStart = p;
      const srcY = h - 1 - row;
      for (let x = 0; x < w; x++) {
        const si = (srcY * w + x) * 4;
        bytes[p++] = src[si + 2];
        bytes[p++] = src[si + 1];
        bytes[p++] = src[si];
      }
      p += rowSize - w * 3;
      if (p !== rowStart + rowSize) throw new Error("BMP row alignment");
    }

    return new Blob([buf], { type: "image/bmp" });
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function sanitizeBaseName(name) {
    const base = name.replace(/\.[^/.]+$/, "");
    const safe = base.replace(/[^\w\-.]+/g, "_").slice(0, 80);
    return safe || "wallpaper";
  }

  $.dropzone.addEventListener("click", () => $.fileInput.click());
  $.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $.fileInput.click();
    }
  });

  $.fileInput.addEventListener("change", () => {
    if ($.fileInput.files?.length) addFiles($.fileInput.files);
    $.fileInput.value = "";
  });

  for (const ev of ["dragenter", "dragover"]) {
    $.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      $.dropzone.classList.add("dragover");
    });
  }
  $.dropzone.addEventListener("dragleave", () => {
    $.dropzone.classList.remove("dragover");
  });
  $.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    $.dropzone.classList.remove("dragover");
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  function syncControlLabelsFrom(el) {
    if (el === $.scale) $.scaleVal.textContent = `${$.scale.value}%`;
    if (el === $.offsetX) $.offsetXVal.textContent = $.offsetX.value;
    if (el === $.offsetY) $.offsetYVal.textContent = $.offsetY.value;
  }

  function onRangeInput(el) {
    syncControlLabelsFrom(el);
    requestComposite();
  }

  for (const el of [$.scale, $.offsetX, $.offsetY]) {
    el.addEventListener("input", () => onRangeInput(el));
  }
  for (const el of [$.eink, $.dither]) {
    el.addEventListener("change", () => requestComposite());
  }
  $.fitMode.addEventListener("change", () => requestComposite());
  $.orientation?.addEventListener("change", () => composite());

  $.clearQueue?.addEventListener("click", clearQueue);
  $.duplicateActive?.addEventListener("click", duplicateActiveItem);

  $.resetTransform.addEventListener("click", () => {
    $.scale.value = "100";
    $.offsetX.value = "0";
    $.offsetY.value = "0";
    $.scaleVal.textContent = "100%";
    $.offsetXVal.textContent = "0";
    $.offsetYVal.textContent = "0";
    composite();
  });

  $.downloadBmp.addEventListener("click", () => {
    const item = getActiveItem();
    if (!item) return;
    syncCanvasDimensions();
    drawSourceToOutput(item);
    const bmp = canvasToBmp24Blob(outCanvas);
    const w = outCanvas.width;
    const h = outCanvas.height;
    const orient = isLandscape() ? "landscape" : "portrait";
    downloadBlob(
      bmp,
      `${sanitizeBaseName(item.name)}-xteink-x4-${orient}-${w}x${h}.bmp`
    );
  });

  function endPreviewDrag(e) {
    if (previewDragPointerId === null || e.pointerId !== previewDragPointerId) {
      return;
    }
    previewDragPointerId = null;
    $.previewBezel?.classList.remove("preview-dragging");
    try {
      $.previewBezel?.releasePointerCapture(e.pointerId);
    } catch {
      /* not capturing */
    }
  }

  $.previewBezel?.addEventListener("pointerdown", (e) => {
    const item = getActiveItem();
    if (!item) return;
    syncCanvasDimensions();
    const fit = $.fitMode.value;
    if (fit === "stretch") return;
    refreshLayoutForPan(item, fit, Number($.scale.value) / 100);
    if (!layoutForPan.canPanX && !layoutForPan.canPanY) return;
    if (e.button !== 0 && e.pointerType !== "touch") return;

    e.preventDefault();
    previewDragPointerId = e.pointerId;
    previewDragLastX = e.clientX;
    previewDragLastY = e.clientY;
    $.previewBezel?.classList.add("preview-dragging");
    try {
      $.previewBezel?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  $.previewBezel?.addEventListener("pointermove", (e) => {
    if (previewDragPointerId === null || e.pointerId !== previewDragPointerId) {
      return;
    }

    const scale = previewCanvasScaleFactor();
    if (scale <= 0) return;

    const dxCanvas = (e.clientX - previewDragLastX) / scale;
    const dyCanvas = (e.clientY - previewDragLastY) / scale;
    previewDragLastX = e.clientX;
    previewDragLastY = e.clientY;

    let panX = Number($.offsetX.value) / 100;
    let panY = Number($.offsetY.value) / 100;

    if (layoutForPan.canPanX && layoutForPan.halfSlideX > 0) {
      panX += dxCanvas / layoutForPan.halfSlideX;
    }
    if (layoutForPan.canPanY && layoutForPan.halfSlideY > 0) {
      panY += dyCanvas / layoutForPan.halfSlideY;
    }

    panX = Math.max(-1, Math.min(1, panX));
    panY = Math.max(-1, Math.min(1, panY));

    $.offsetX.value = String(Math.round(panX * 100));
    $.offsetY.value = String(Math.round(panY * 100));
    $.offsetXVal.textContent = $.offsetX.value;
    $.offsetYVal.textContent = $.offsetY.value;
    requestComposite();
  });

  $.previewBezel?.addEventListener("pointerup", endPreviewDrag);
  $.previewBezel?.addEventListener("pointercancel", endPreviewDrag);
  $.previewBezel?.addEventListener("lostpointercapture", (e) => {
    if (e.pointerId === previewDragPointerId) {
      previewDragPointerId = null;
      $.previewBezel?.classList.remove("preview-dragging");
    }
  });

  composite();
})();
