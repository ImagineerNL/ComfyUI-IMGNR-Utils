// IMGNR-Utils/Split Screen
// Initial code
// =========================================================
// FEATURE: DRAGGABLE SPLIT SCREEN
// =========================================================
// split screen Icon by Yudhi Restu Pebriyanto from Noun Project (CC BY 3.0)
// https://thenounproject.com/icon/split-screen-6095990/

import { app } from "../../scripts/app.js";

const PREFIX = "IMGNR";

// --- STATE GLOBALS ---
let isSplit = false;
let secondaryCanvas = null;
let separatorEl = null; 
let separatorLine = null;
let bgBlocker = null;     
let originalMenu = null;
let originalZoomPopup = null; 
let popupObserver = null; 
let labelOriginal = null;
let labelClone = null;
let mirrorContainer = null;
let splitControls = null; 

// [CHANGE] Removed global 'wrapper' to force ID-based lookups for safety
let currentSplitX = window.innerWidth / 2; 
let pendingSplitX = window.innerWidth / 2; 
let isDragging = false;

// Variables to restore state
let originalBodyBg = ""; 
let originalOverflow = ""; 
let originalMainStyle = { width: "", height: "", position: "", zIndex: "" };

// --- DOM SYNC MANAGER ---
class MirrorDOMManager {
    constructor() {
        this.elements = new Map();
        this.container = null;
        this.interactionEnabled = true; 
    }

    init(containerEl) {
        this.container = containerEl;
    }

    setInteraction(enabled) {
        this.interactionEnabled = enabled;
        const pState = enabled ? "auto" : "none";
        
        for (const entry of this.elements.values()) {
            if (entry.element) {
                entry.element.style.pointerEvents = pState;
                const inputs = this.getInputs(entry.element);
                inputs.forEach(i => i.style.pointerEvents = pState);
            }
        }
    }

    shouldUpdate(canvas) {
        return !!(canvas && canvas.ds); 
    }

    update(canvas) {
        if (!canvas || !this.container) return;

        let targetNodes = [];
        if (canvas.graph && canvas.graph._nodes) {
            targetNodes = canvas.graph._nodes;
        }

        const currentFrameIds = new Set();
        
        for (const node of targetNodes) {
            if(node.widgets) {
                node.widgets.forEach((widget, wIndex) => {
                    if (widget.element) {
                        const id = `${node.id}_w_${wIndex}`;
                        this.processWidget(canvas, node, widget, wIndex, id);
                        currentFrameIds.add(id);
                    }
                });
            }
        }

        for (const [id, data] of this.elements.entries()) {
            if (!currentFrameIds.has(id)) {
                if (data.element) data.element.remove();
                this.elements.delete(id);
            }
        }
    }

    getInputs(el) {
        const found = [];
        if (el.matches && el.matches("input, textarea, select, button")) found.push(el);
        if (el.querySelectorAll) {
            const kids = el.querySelectorAll("input, textarea, select, button");
            kids.forEach(k => found.push(k));
        }
        return found;
    }

    createClone(sourceEl, widget, node) {
        const clone = sourceEl.cloneNode(true);
        if (clone.id) clone.id = "clone_" + clone.id;

        const pState = this.interactionEnabled ? "auto" : "none";

        Object.assign(clone.style, {
            position: "absolute",
            transform: "",
            left: "", top: "",
            margin: "0",
            boxSizing: "border-box",
            pointerEvents: pState 
        });
        
        const inputs = this.getInputs(clone);
        inputs.forEach(input => {
            input.style.pointerEvents = pState;
            input.addEventListener("input", (e) => {
                const val = e.target.value;
                widget.value = val;
                if (widget.element && "value" in widget.element) widget.element.value = val;
                if (widget.callback) widget.callback(widget.value, app.canvas, node, app.canvas.getPointer(), e);
                app.graph.setDirtyCanvas(true, true);
            });
            input.addEventListener("mousedown", (e) => e.stopPropagation());
        });

        clone.addEventListener("dblclick", (e) => {
            if (!this.interactionEnabled) return; 
            e.stopPropagation();
            e.preventDefault();
            const evt = new MouseEvent("dblclick", {
                bubbles: true,
                cancelable: true,
                view: window
            });
            sourceEl.dispatchEvent(evt);
        });

        clone.addEventListener("mousedown", (e) => e.stopPropagation());

        return clone;
    }

    processWidget(canvas, node, widget, wIndex, id) {
        const sourceEl = widget.element.closest(".dom-widget") || widget.element;
        let entry = this.elements.get(id);

        if (!entry) {
            const clone = this.createClone(sourceEl, widget, node);
            this.container.appendChild(clone);
            
            entry = { 
                element: clone, 
                sourceElement: sourceEl, 
                cachedHTML: sourceEl.innerHTML 
            };
            this.elements.set(id, entry);
        }

        let clone = entry.element;

        const userTyping = document.activeElement && clone.contains(document.activeElement);

        if (!userTyping) {
            const currentHTML = sourceEl.innerHTML;
            if (currentHTML !== entry.cachedHTML) {
                const newClone = this.createClone(sourceEl, widget, node);
                this.syncWidgetPosition(canvas, node, widget, newClone, sourceEl);
                newClone.className = sourceEl.className;
                
                clone.replaceWith(newClone);
                entry.element = newClone;
                entry.cachedHTML = currentHTML;
                clone = newClone; 
            }
        }

        if (clone.className !== sourceEl.className) {
            clone.className = sourceEl.className;
        }

        const inputs = this.getInputs(clone);
        inputs.forEach(input => {
            if (document.activeElement !== input && String(input.value) !== String(widget.value)) {
                input.value = widget.value;
            }
        });

        const sImgs = sourceEl.querySelectorAll("img");
        const cImgs = clone.querySelectorAll("img");
        if (sImgs.length === cImgs.length) {
            sImgs.forEach((sImg, i) => {
                if (cImgs[i].src !== sImg.src) cImgs[i].src = sImg.src;
            });
        }

        this.syncWidgetPosition(canvas, node, widget, clone, sourceEl);
    }

    syncWidgetPosition(canvas, node, widget, el, sourceEl) {
        const scale = canvas.ds.scale;
        const offset = canvas.ds.offset;
        
        const relY = widget.y || (LiteGraph.NODE_TITLE_HEIGHT + 20); 
        
        const logicalX = (node.pos[0] + 10 + offset[0]) * scale;
        const logicalY = (node.pos[1] + relY + offset[1]) * scale;
        
        if (Number.isFinite(logicalX) && Number.isFinite(logicalY)) {
            el.style.transformOrigin = "0 0";
            el.style.transform = `translate(${logicalX}px, ${logicalY}px) scale(${scale})`;
            el.style.display = "block";
            
            el.style.width = (node.size[0] - 20) + "px";
            if (sourceEl.style.height) {
                 el.style.height = sourceEl.style.height;
            } else {
                 el.style.height = ""; 
            }
        }
    }

    destroy() {
        for (const [id, data] of this.elements.entries()) {
            if (data.element) data.element.remove();
        }
        this.elements.clear();
    }
}

const mirrorDOM = new MirrorDOMManager();
const originalDraw = LGraphCanvas.prototype.draw;

// --- PERSISTENCE HELPERS ---
function getGraphData() {
    if (!app.graph) return null;
    if (!app.graph.extra) app.graph.extra = {};
    return app.graph.extra.IMGNR_SplitScreen || null;
}
function setGraphData(data) {
    if (!app.graph) return;
    if (!app.graph.extra) app.graph.extra = {};
    const existing = app.graph.extra.IMGNR_SplitScreen || {};
    app.graph.extra.IMGNR_SplitScreen = { ...existing, ...data };
}
function loadSavedPosition() {
    const data = getGraphData();
    if (data && typeof data.splitX === "number") {
        return Math.max(50, Math.min(window.innerWidth - 50, data.splitX));
    }
    return window.innerWidth / 2;
}
function savePosition(x) { setGraphData({ splitX: Math.floor(x) }); }

function getDSValues(dsObj) {
    if (!dsObj) return { scale: 1, tx: 0, ty: 0 };
    if (typeof dsObj.scale === "number" && dsObj.offset) {
        return { scale: dsObj.scale, tx: dsObj.offset[0], ty: dsObj.offset[1] };
    }
    return { scale: 1, tx: 0, ty: 0 };
}
function setDSValues(dsObj, v) {
    if (!dsObj) return;
    if (typeof dsObj.scale === "number" && dsObj.offset) {
        dsObj.scale = v.scale;
        dsObj.offset[0] = v.tx; 
        dsObj.offset[1] = v.ty;
    } 
}
function saveCameraState() {
    if (!secondaryCanvas || !secondaryCanvas.ds) return;
    setGraphData({ camera: getDSValues(secondaryCanvas.ds) });
}
function applyCameraState() {
    if (!secondaryCanvas || !secondaryCanvas.ds) return;
    const data = getGraphData();
    const target = (data && data.camera) ? data.camera : getDSValues(app.canvas.ds);
    setDSValues(secondaryCanvas.ds, target);
    secondaryCanvas.dirty_canvas = true; 
    secondaryCanvas.dirty_bgcanvas = true;
}

// --- SYNC MANAGERS ---
function syncSelectionState(source, target) {
    if(!source || !target) return;
    target.deselectAllNodes();
    if (source.selected_nodes) {
        for (const id in source.selected_nodes) {
            const node = app.graph.getNodeById(id);
            if (node) target.selectNode(node, true); 
        }
    }
    target.setDirty(true, true);
}
const handleMainMouseUp = () => { if (isSplit && secondaryCanvas) requestAnimationFrame(() => syncSelectionState(app.canvas, secondaryCanvas)); };
const handleSecMouseUp = () => { if (isSplit && app.canvas) requestAnimationFrame(() => syncSelectionState(secondaryCanvas, app.canvas)); };

function setupInteractionSync(secCanvasEl) {
    secCanvasEl.addEventListener("mouseup", handleSecMouseUp);
    const mainEl = document.getElementById("graph-canvas");
    if(mainEl) mainEl.addEventListener("mouseup", handleMainMouseUp);
}
function teardownInteractionSync(secCanvasEl) {
    if(secCanvasEl) secCanvasEl.removeEventListener("mouseup", handleSecMouseUp);
    const mainEl = document.getElementById("graph-canvas");
    if(mainEl) mainEl.removeEventListener("mouseup", handleMainMouseUp);
}

// --- UI SETUP ---

function findZoomPopup() {
    const candidates = document.querySelectorAll("div.absolute.right-0.z-1300");
    for (const c of candidates) {
        if (c.classList.contains("bottom-[62px]")) {
            return c;
        }
    }
    return null;
}

function setupMenus() {
    const candidateMenus = document.querySelectorAll(".p-buttongroup");
    for (const m of candidateMenus) {
        if (m.classList.contains("right-0") && m.classList.contains("bottom-0")) {
            originalMenu = m;
            break;
        }
    }
    
    popupObserver = new MutationObserver((mutations) => {
        let found = false;
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.nodeType === 1 && n.classList.contains("absolute") && n.classList.contains("right-0")) {
                    if (n.classList.contains("bottom-[62px]")) {
                        originalZoomPopup = n;
                        found = true;
                    }
                }
            }
        }
        if (found) applyResizeNow(); 
    });
    
    popupObserver.observe(document.body, { childList: true, subtree: true });
    
    originalZoomPopup = findZoomPopup();
}

function teardownMenus() {
    if (originalMenu) {
        originalMenu.style.display = ""; 
        originalMenu.style.right = "";   
        originalMenu = null;
    }
    
    if (popupObserver) {
        popupObserver.disconnect();
        popupObserver = null;
    }
    
    if (originalZoomPopup) {
        originalZoomPopup.style.right = "";
        originalZoomPopup = null;
    }
}

function setupToolbarButton() {
    const containerSelector = ".actionbar-container .flex.gap-2.mx-2";
    const addButton = (container) => {
        if (container.querySelector(".imgnr-split-screen-btn")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "comfyui-button-group imgnr-split-screen-btn"; 
        const btn = document.createElement("button");
        btn.className = "comfyui-button primary"; 
        btn.title = "Toggle Split Screen (Shift+Click for Settings)"; 
        
        btn.onclick = (e) => {
            if (e.shiftKey) {
                // 1. Trigger Keyboard Shortcut
                window.dispatchEvent(new KeyboardEvent('keydown', {
                    key: ',',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));

                // 2. Find and Scroll/Focus IMGNR Tab (Robust for List Items)
                const tryClickTab = (attempts = 0) => {
                    if (attempts > 20) return; // Stop after 1s
                    
                    // [FIX] Target LI with role="option" as per user HTML
                    const candidates = document.querySelectorAll('li[role="option"]');
                    let target = null;

                    for (const el of candidates) {
                        const ariaLabel = el.getAttribute("aria-label") || "";
                        const text = el.textContent || "";
                        
                        if (ariaLabel === "IMGNR" || text.includes("IMGNR")) {
                            target = el;
                            break;
                        }
                    }

                    if (target) {
                        target.click();
                        target.scrollIntoView({ behavior: "smooth", block: "center" });
                        
                        // Flash background
                        target.style.transition = "background-color 0.5s";
                        const originalBg = target.style.backgroundColor;
                        target.style.backgroundColor = "rgba(8, 181, 167, 0.4)";
                        setTimeout(() => { target.style.backgroundColor = originalBg; }, 800);
                    } else {
                        setTimeout(() => tryClickTab(attempts + 1), 50);
                    }
                };
                tryClickTab();
            } else {
                toggleSplitScreen();
            }
        };

        Object.assign(btn.style, {
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "40px", height: "100%", padding: "0", border: "none", cursor: "pointer", background: "transparent"
        });
        const icon = document.createElement("img");
        icon.id = "imgnr-split-screen-icon"; 
        icon.src = new URL("./split_screen.svg", import.meta.url).href;
        Object.assign(icon.style, {
            width: "36px", height: "36px", objectFit: "contain", filter: "invert(0.9)", display: "block", paddingTop: "6px"
        });
        icon.onerror = () => { icon.style.display = "none"; btn.textContent = "||"; };
        btn.appendChild(icon);
        wrapper.appendChild(btn);
        container.prepend(wrapper);
    };
    const container = document.querySelector(containerSelector);
    if (container) addButton(container);
    else {
        const obs = new MutationObserver(() => {
            const c = document.querySelector(containerSelector);
            if(c) { addButton(c); obs.disconnect(); }
        });
        obs.observe(document.body, {childList: true, subtree: true});
    }
}

// =========================================================
// LAYOUT ENGINE: MASSIVE CANVAS
// =========================================================

function forceHighDPIResize(canvasObj, logicalWidth, logicalHeight) {
    const ratio = window.devicePixelRatio || 1;
    const canvas = canvasObj.canvas;
    canvas.width = Math.round(logicalWidth * ratio);
    canvas.height = Math.round(logicalHeight * ratio);
    canvas.style.width = logicalWidth + "px";
    canvas.style.height = logicalHeight + "px";
    const ctx = canvasObj.ctx;
    if(ctx) ctx.scale(ratio, ratio);
}

function refreshSettings() {
    if (!isSplit || !secondaryCanvas) return;
    
    // 1. Interaction
    const interactionEnabled = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.EnableInteraction`, true);
    secondaryCanvas.allow_interaction = interactionEnabled;
    secondaryCanvas.allow_dragnodes = interactionEnabled;
    mirrorDOM.setInteraction(interactionEnabled);
    
    // 2. Background
    const bgColor = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.CloneBgColor`, "#141414");
    secondaryCanvas.clear_background_color = bgColor;
    
    const w = document.getElementById("imgnr-split-wrapper");
    if (w) w.style.backgroundColor = bgColor;
    
    // 3. Labels
    const labelColor = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LabelColor`, "#7a7a7a");
    const labelSize = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LabelSize`, 10);
    
    if (labelOriginal) {
        labelOriginal.style.color = labelColor;
        labelOriginal.style.fontSize = labelSize + "px";
    }
    if (labelClone) {
        labelClone.style.color = labelColor;
        labelClone.style.fontSize = labelSize + "px";
    }
    
    // 4. Line Color/Width
    const userColor = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LineColor`, "#d33");
    const userWidth = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LineWidth`, 4);
    if (separatorLine) {
        separatorLine.style.background = userColor;
        separatorLine.style.width = userWidth + "px";
    }
    
    secondaryCanvas.dirty_bgcanvas = true; 
    secondaryCanvas.dirty_canvas = true;
    app.canvas.setDirty(true, true);
    applyResizeNow();
}

function applyResizeNow() {
    // [FIX] Always ID-lookup to ensure valid reference
    const wrapper = document.getElementById("imgnr-split-wrapper");
    const sep = document.getElementById("multiview-separator");
    if (!wrapper || !sep) return;

    if (!currentSplitX || isNaN(currentSplitX)) currentSplitX = window.innerWidth / 2;
    const targetX = isDragging ? pendingSplitX : currentSplitX;
    const boundaryX = Math.floor(Math.max(50, Math.min(window.innerWidth - 50, targetX)));

    wrapper.style.left = boundaryX + "px";
    wrapper.style.width = (window.innerWidth - boundaryX) + "px";
    
    const secCanvasEl = document.getElementById("multiview-canvas");
    if (secCanvasEl) secCanvasEl.style.left = -boundaryX + "px";
    if (mirrorContainer) mirrorContainer.style.left = -boundaryX + "px";

    sep.style.left = (boundaryX - 15) + "px";

    const rightOffset = window.innerWidth - boundaryX;

    if (originalMenu) {
        originalMenu.style.right = rightOffset + "px";
        originalMenu.style.borderWidth = "2px";
        originalMenu.style.borderColor = "var(--component-node-widget-background)";
        originalMenu.style.background = "var(--comfy-menu-bg)";
        originalMenu.style.height = "40px";
		originalMenu.style.padding = "var(--spacing)";
    }
    
    if (!originalZoomPopup) originalZoomPopup = findZoomPopup();
    if (originalZoomPopup) {
        originalZoomPopup.style.right = rightOffset + "px";
    }
    
    if (splitControls) {
        splitControls.style.left = (boundaryX + 5) + "px"; 
    }

    if (labelOriginal) {
        labelOriginal.style.left = (boundaryX / 2) + "px";
        labelOriginal.style.transform = "translateX(-50%)";
    }
    if (labelClone) {
        const rightW = window.innerWidth - boundaryX;
        labelClone.style.left = (boundaryX + (rightW / 2)) + "px";
        labelClone.style.transform = "translateX(-50%)";
    }
}

function onMouseDown(e) {
    isDragging = true;
    document.body.style.cursor = "col-resize"; 
    if (separatorLine) separatorLine.style.background = "#ff0000"; 
    
    const mainCanvas = document.getElementById("graph-canvas");
    if (mainCanvas) {
        mainCanvas.style.width = "100vw";
        if(app.canvas) app.canvas.resize(); 
    }

    const wrapper = document.getElementById("imgnr-split-wrapper");
    if (wrapper) wrapper.style.pointerEvents = "none"; 
    e.preventDefault();
}

function onMouseMove(e) {
    if (!isDragging) return;
    pendingSplitX = e.clientX;
    requestAnimationFrame(applyResizeNow);
}

function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    currentSplitX = pendingSplitX; 
    document.body.style.cursor = "default";
    savePosition(currentSplitX);
    if (separatorLine) separatorLine.style.background = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LineColor`, "#d33");
    
    const wrapper = document.getElementById("imgnr-split-wrapper");
    if (wrapper) wrapper.style.pointerEvents = "auto";
    
    const mainCanvas = document.getElementById("graph-canvas");
    if (mainCanvas) {
        const boundaryX = Math.floor(Math.max(50, Math.min(window.innerWidth - 50, currentSplitX)));
        mainCanvas.style.width = boundaryX + "px";
        if(app.canvas) app.canvas.resize(); 
    }
    
    app.canvas.dirty_canvas = true;
    app.canvas.dirty_bgcanvas = true;
}

// --- SMART ZOOM LOGIC ---
function getRightPaneVisualCenter() {
    const visibleWidth = window.innerWidth - currentSplitX;
    return currentSplitX + (visibleWidth / 2);
}

function centerZoom(canvasInstance, targetScale) {
    if(!canvasInstance || !canvasInstance.ds) return;
    
    const ds = canvasInstance.ds;
    const visualCenterX = getRightPaneVisualCenter();
    const visualCenterY = window.innerHeight / 2;
    
    const graphPointX = (visualCenterX / ds.scale) - ds.offset[0];
    const graphPointY = (visualCenterY / ds.scale) - ds.offset[1];
    
    ds.scale = targetScale;
    
    ds.offset[0] = (visualCenterX / ds.scale) - graphPointX;
    ds.offset[1] = (visualCenterY / ds.scale) - graphPointY;
    
    canvasInstance.setDirty(true, true);
}

function fitViewToRightPane(canvasInstance) {
    if(!canvasInstance) return;
    
    const selection = canvasInstance.selected_nodes || {};
    const nodes = Object.values(selection);
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    let targetNodes = nodes;
    if (targetNodes.length === 0 && canvasInstance.graph && canvasInstance.graph._nodes) {
        targetNodes = canvasInstance.graph._nodes;
    }
    
    if (targetNodes.length === 0) {
        centerZoom(canvasInstance, 1);
        return;
    }

    for (const n of targetNodes) {
        minX = Math.min(minX, n.pos[0]);
        maxX = Math.max(maxX, n.pos[0] + n.size[0]);
        minY = Math.min(minY, n.pos[1]);
        maxY = Math.max(maxY, n.pos[1] + n.size[1]);
    }

    const graphCX = (minX + maxX) / 2;
    const graphCY = (minY + maxY) / 2;
    
    const nodesW = maxX - minX;
    const nodesH = maxY - minY;
    
    const topMenuHeight = 110; 
    
    const paneW = window.innerWidth - currentSplitX;
    const paneH = window.innerHeight - topMenuHeight; 
    
    const marginX = 50;
	const marginY = 50;
    const scaleX = (paneW - marginX * 2) / nodesW;
    const scaleY = (paneH - marginY * 2) / nodesH;
    
    let targetScale = Math.min(scaleX, scaleY);
    targetScale = Math.min(Math.max(targetScale, 0.02), 4.0); 
    
    const ds = canvasInstance.ds;
    ds.scale = targetScale;
    
    const visualCX = getRightPaneVisualCenter();
    const visualCY = topMenuHeight + (paneH / 2);
    
    ds.offset[0] = (visualCX / ds.scale) - graphCX;
    ds.offset[1] = (visualCY / ds.scale) - graphCY;
    
    canvasInstance.setDirty(true, true);
}

function toggleSplitScreen() {
    const mainCanvas = document.getElementById("graph-canvas");
    if (!mainCanvas) return;
    const icon = document.getElementById("imgnr-split-screen-icon");
    isSplit = !isSplit;

    if (icon) icon.style.filter = isSplit ? "invert(76%) sepia(18%) saturate(1065%) hue-rotate(184deg) brightness(101%) contrast(96%)" : "invert(0.9)";

    if (isSplit) {
        originalMainStyle.width = mainCanvas.style.width;
        originalMainStyle.height = mainCanvas.style.height;
        originalMainStyle.position = mainCanvas.style.position;
        originalBodyBg = document.body.style.background;
        originalOverflow = document.body.style.overflow;

        const userColor = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LineColor`, "#d33");
        const userWidth = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LineWidth`, 4);
        const labelColor = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LabelColor`, "#7a7a7a");
        const labelSize = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.LabelSize`, 10);
        const bgColor = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.CloneBgColor`, "#141414");
        const allowInteract = app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.EnableInteraction`, true);

        currentSplitX = loadSavedPosition();
        pendingSplitX = currentSplitX;

        document.body.style.overflow = "hidden"; 

        const boundaryX = Math.floor(Math.max(50, Math.min(window.innerWidth - 50, currentSplitX)));
        mainCanvas.style.width = boundaryX + "px";
        if(app.canvas) app.canvas.resize();

        const wrapper = document.createElement("div");
        wrapper.id = "imgnr-split-wrapper";
        Object.assign(wrapper.style, {
            position: "absolute", top: "0", right: "0", height: "100%", 
            overflow: "hidden", zIndex: "50", background: bgColor 
        });
        document.body.appendChild(wrapper);

        separatorEl = document.createElement("div");
        separatorEl.id = "multiview-separator";
        Object.assign(separatorEl.style, {
            position: "absolute", top: "0", width: "30px", height: "100%",
            background: "transparent", cursor: "col-resize", 
            zIndex: "60", userSelect: "none", display: "flex", justifyContent: "center" 
        });
        separatorLine = document.createElement("div");
        Object.assign(separatorLine.style, {
            width: `${userWidth}px`, height: "100%", background: userColor, transition: "background 0.1s"
        });
        separatorEl.appendChild(separatorLine);
        separatorEl.onmouseenter = () => { if(!isDragging && separatorLine) separatorLine.style.background = "#ff0000"; };
        separatorEl.onmouseleave = () => { if(!isDragging && separatorLine) separatorLine.style.background = userColor; };
        separatorEl.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        document.body.appendChild(separatorEl);

        const MASSIVE_PAD = 0;
        const massiveCSSWidth = window.innerWidth + MASSIVE_PAD;
        const massiveCSSHeight = window.innerHeight + MASSIVE_PAD;

        mirrorContainer = document.createElement("div");
        mirrorContainer.id = "imgnr-mirror-container";
        Object.assign(mirrorContainer.style, {
            position: "absolute", top: "0", left: "0", 
            width: massiveCSSWidth + "px", height: massiveCSSHeight + "px",
            pointerEvents: "none", zIndex: "55", overflow: "visible" 
        });
        wrapper.appendChild(mirrorContainer);

        const secCanvasEl = document.createElement("canvas");
        secCanvasEl.id = "multiview-canvas";
        secCanvasEl.tabIndex = 1; 
        Object.assign(secCanvasEl.style, {
            position: "absolute", top: "0", left: "0", outline: "none",
			background: "transparent", margin: "0", padding: "0",
            width: massiveCSSWidth + "px", height: massiveCSSHeight + "px"  
        });
        wrapper.appendChild(secCanvasEl);

        labelOriginal = document.createElement("div");
        labelOriginal.textContent = "ORIGINAL";
        Object.assign(labelOriginal.style, {
            position: "fixed", bottom: "10px", color: labelColor, fontSize: `${labelSize}px`,
            fontFamily: "Lucida Console, sans-serif", pointerEvents: "none",
			padding: "5px", background: "rgba(0,0,0,0.7)", zIndex: "1001", userSelect: "none", whiteSpace: "nowrap"
        });
        document.body.appendChild(labelOriginal);

        labelClone = document.createElement("div");
        labelClone.textContent = "CLONE VIEW";
        Object.assign(labelClone.style, {
            position: "fixed", bottom: "10px", color: labelColor, fontSize: `${labelSize}px`,
            fontFamily: "Lucida Console, sans-serif", pointerEvents: "none",
			padding: "5px", background: "rgba(0,0,0,0.7)", zIndex: "1001", userSelect: "none", whiteSpace: "nowrap"
        });
        document.body.appendChild(labelClone);
        
        splitControls = document.createElement("div");
        splitControls.className = "p-buttongroup p-component absolute bottom-0 z-[1200] flex-row gap-1 border-[1px] border-interface-stroke bg-comfy-menu-bg p-2";
        
        Object.assign(splitControls.style, {
            position: "fixed", 
            bottom: "4px", 
            display: "flex", gap: "4px", padding: "4px",
            borderRadius: "8px", 
            borderWidth: "2px",
			borderColor: "var(--component-node-widget-background)",
            background: "var(--comfy-menu-bg)",
            pointerEvents: "auto",
            height: "40px"
        });
        
        const createCtrlBtn = (text, iconSvg, action) => {
            const b = document.createElement("button");
            b.className = "p-button p-component p-button-secondary bg-comfy-menu-bg hover:bg-interface-button-hover-surface! p-0 h-8";
            Object.assign(b.style, {
                background: "transparent", border: "none", cursor: "pointer",
                borderRadius: "8px", //color: "var(--input-text)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                height: "32px", minWidth: "32px",
                padding: text ? "0 12px" : "0", 
                fontSize: "12px", fontFamily: "sans-serif"
            });
            b.innerHTML = iconSvg ? 
                `<span class="flex items-center gap-2">${iconSvg}${text ? `<span>${text}</span>` : ''}</span>` : 
                `<span>${text}</span>`;
            b.onmouseenter = () => b.style.background = "var(--comfy-menu-secondary-bg)";
            b.onmouseleave = () => b.style.background = "transparent";
            b.onclick = action;
            return b;
        };
        
        const iconFit = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
        const btnFit = createCtrlBtn("", iconFit, () => fitViewToRightPane(secondaryCanvas));
        btnFit.title = "Fit View (Center Selection)";

        const iconSync = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;
        const btnSync = createCtrlBtn("MATCH ZOOM", iconSync, () => {
            if(app.canvas && secondaryCanvas) {
                centerZoom(secondaryCanvas, app.canvas.ds.scale);
            }
        });
        
        const div = () => {
            const d = document.createElement("div");
            d.className = "h-[27px] w-[1px] self-center bg-node-divider";
            Object.assign(d.style, { width: "1px", height: "24px", background: "var(--border-color)", alignSelf: "center", margin: "0 2px" });
            return d;
        };
        
        const btnReset = createCtrlBtn("1:1", null, () => centerZoom(secondaryCanvas, 1));
        
        splitControls.appendChild(btnFit);
        splitControls.appendChild(div());
        splitControls.appendChild(btnSync);
        splitControls.appendChild(div());
        splitControls.appendChild(btnReset);
        document.body.appendChild(splitControls);

        mirrorDOM.init(mirrorContainer);
        // Initialize State Correctly
        mirrorDOM.setInteraction(allowInteract);
        
        secondaryCanvas = new LGraphCanvas(secCanvasEl, app.graph);
        
        secondaryCanvas.background_image = app.canvas.background_image;
        secondaryCanvas.clear_background = true;
		secondaryCanvas.clear_background_color = bgColor;
		secondaryCanvas.highquality_render = true; 
		secondaryCanvas.render_canvas_border = false; 
		secondaryCanvas.allow_dragnodes = allowInteract; 
		secondaryCanvas.allow_interaction = allowInteract;
		secondaryCanvas.read_only = false; 
		secondaryCanvas.zoom_modify_alpha = true; 

        forceHighDPIResize(secondaryCanvas, massiveCSSWidth, massiveCSSHeight);

        setupInteractionSync(secCanvasEl);
        secondaryCanvas.startRendering();
        setTimeout(() => { secondaryCanvas.stopRendering(); }, 100);

        setupMenus();
        applyResizeNow();
        applyCameraState(); 

        app.canvas.draw = function(force_fg, force_bg) {
            const wasDirtyCanvas = this.dirty_canvas;
            const wasDirtyBg = this.dirty_bgcanvas;
            originalDraw.apply(this, arguments);

            if (secondaryCanvas) {
                if (secondaryCanvas.graph !== app.graph) secondaryCanvas.graph = app.graph;
                
                const wrapper = document.getElementById("imgnr-split-wrapper");
                if (wrapper) {
                    const shift = -(wrapper.getBoundingClientRect().left);
                    secCanvasEl.style.left = shift + "px";
                    mirrorContainer.style.left = shift + "px";
                }

                if (wasDirtyBg || force_bg) secondaryCanvas.dirty_bgcanvas = true;
                if (wasDirtyCanvas || force_fg) secondaryCanvas.dirty_canvas = true;

                originalDraw.call(secondaryCanvas, force_fg, force_bg);
                mirrorDOM.update(secondaryCanvas);
                mirrorDOM.drawDebug && mirrorDOM.drawDebug(secondaryCanvas.ctx); 
            }
        };
        
        window.addEventListener("resize", onWindowResize);
        app.canvas.draw(true, true);

    } else {
        savePosition(currentSplitX);
        saveCameraState();

        mirrorDOM.destroy(); 
        teardownMenus();
        teardownInteractionSync(document.getElementById("multiview-canvas"));

        if (labelOriginal) { labelOriginal.remove(); labelOriginal = null; }
        if (labelClone) { labelClone.remove(); labelClone = null; }
        if (splitControls) { splitControls.remove(); splitControls = null; }
        
        // [FIX] Always cleanup via ID
        const wrapper = document.getElementById("imgnr-split-wrapper");
        if (wrapper) wrapper.remove();

        app.canvas.draw = originalDraw;

        window.removeEventListener("resize", onWindowResize);
        if (bgBlocker) { bgBlocker.remove(); bgBlocker = null; }
        if (separatorEl) { separatorEl.remove(); separatorEl = null; separatorLine = null; }
        
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);

        mainCanvas.style.width = originalMainStyle.width || "100%";
        mainCanvas.style.height = originalMainStyle.height || "100%";
        mainCanvas.style.position = originalMainStyle.position || "relative";
        document.body.style.overflow = originalOverflow || "";
        document.body.style.background = originalBodyBg || "";
        
        mainCanvas.removeAttribute("width");
        mainCanvas.removeAttribute("height");
        
        if (app.canvas && app.canvas.resize) {
            app.canvas.resize();
        }

        secondaryCanvas = null;
        app.canvas.draw(true, true);
    }
}

function onWindowResize() {
    if (app.canvas) app.canvas.resize();
    if (secondaryCanvas) {
        const MASSIVE_PAD = 0;
        const massiveCSSWidth = window.innerWidth + MASSIVE_PAD;
        const massiveCSSHeight = window.innerHeight + MASSIVE_PAD;
        
        forceHighDPIResize(secondaryCanvas, massiveCSSWidth, massiveCSSHeight);
        
        if (mirrorContainer) {
            mirrorContainer.style.width = massiveCSSWidth + "px";
            mirrorContainer.style.height = massiveCSSHeight + "px";
        }
        secondaryCanvas.dirty_canvas = true;
    }
    applyResizeNow();
}

app.registerExtension({
    name: "IMGNR.SplitScreen",
    setup() {
        window.IMGNR_REFRESH_SPLIT_SCREEN = refreshSettings;
        
        if (app.ui.settings.getSettingValue(`${PREFIX}.SplitScreen.Enabled`, true)) {
            setupToolbarButton();
            const originalLoadGraph = app.loadGraphData;
            app.loadGraphData = function(graphData) {
                const result = originalLoadGraph.apply(this, arguments);
                if (isSplit) setTimeout(() => refreshSplitViewOnSwitch(), 50);
                return result;
            };
        }
    }
});
function refreshSplitViewOnSwitch() {
    if (!isSplit || !secondaryCanvas) return;
    if (secondaryCanvas.graph !== app.graph) secondaryCanvas.graph = app.graph;
    applyResizeNow();
    applyCameraState();
}