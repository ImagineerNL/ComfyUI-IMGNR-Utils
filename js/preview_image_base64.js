// IMGNR-Utils/js/preview_image_base64.js
// Fixes: Transparant (RGBA) images (+ mask in/out)
// Fixes: Widget background now same as template node color
// Fixes: Zero size widget on spawn due to no image (using placeholder)
// Fixes: Manual Save now prioritizes Connected Inputs over Widgets
// New: Adhoc Save Node
// Updated: Renamed Sequence to Counter
// NEW: A/B Comparison (Slider, Blink, Pin) and Metadata Diff
// NEW: Info Bar (Dimensions)
// FIXED: Save Button styling 
// Updated: Renamed Preview Ad-hoc Save - LastGen Compare (IMGNR)
// FINAL: Adhoc Save Node & Compare Node explicitly separated into 3 independent nodes
// FIXED: Flexbox resizing squish and dynamic onResize node clamp
// FIXED: Node Top Offset (+20px) and forced onResize layout update immediately after generation
// NEW: Session Cache for disposable previews. Reference automatically locks to JSON when Pinned Right.
// FIXED: Reference image remains visible on page reload (clipped with placeholder)
// FIXED: Reference image and Current image alignment (1px overbleed matched)
// FIXED: full_filename output missed overwrite counter

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// --- GLOBAL SESSION CACHE ---
// Survives tab switching, dies on browser refresh.
const sessionImageCache = new Map();

app.registerExtension({
    name: "Comfy.PreviewImageBase64Node.JS",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        const isPreviewNode = nodeData.name === "PreviewImageBase64Node";
        const isSaveNode = nodeData.name === "PreviewImageAdHocSaveNode";
        const isCompareNode = nodeData.name === "PreviewImageCompareNode";
        
        const hasSaveControls = isSaveNode || isCompareNode;
        const hasCompareControls = isCompareNode;

        if (isPreviewNode || hasSaveControls) {

            // --- 1. VISUALIZATION MANAGER ---
            function ensureImageExists(node) {
                if (!node.previewContainerElement) return;
                const imgHolder = node.previewContainerElement.querySelector(".imgnr-img-holder");
                if (!imgHolder) return;

                const currentData = node.persistedImageData; 
                const refData = node.persistedRefData; 
                const hasCurrent = !!(currentData && currentData.uri);
                const hasRef = !!(refData && refData.uri);

                // Update Dimensions Label
                if (node.dimsLabel) {
                     if (hasCurrent && currentData.width) {
                         node.dimsLabel.textContent = `${currentData.width}x${currentData.height}`;
                     } else if (hasRef && refData.width) {
                         node.dimsLabel.textContent = `${refData.width}x${refData.height}`;
                     } else {
                         node.dimsLabel.textContent = "";
                     }
                }

                // Force visual updates of UI elements regardless of state
                if (hasCompareControls) {
                    if (node.updatePinVisual) node.updatePinVisual();
                }

                // 1. Placeholder logic (when completely empty)
                if (!hasCurrent && !hasRef) {
                    imgHolder.innerHTML = "";
                    const img = document.createElement("img");
                    img.src = new URL("./placeholder.png", import.meta.url).href;
                    Object.assign(img.style, {
                        maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto",
                        objectFit: "contain", display: "block"
                    });
                    imgHolder.appendChild(img);
                    
                    if (node.infoBar) node.infoBar.style.display = "none";
                    
                    if (hasCompareControls && node.slider) {
                        node.compOverlay.style.display = "block";
                    }
                    
                    node.onResize?.(node.size);
                    node.setDirtyCanvas(true, true);
                    return;
                }

                // Show Info Bar
                if (node.infoBar) node.infoBar.style.display = "block"; 
                
                // 2. Render Images
                imgHolder.innerHTML = ""; 
                const layerContainer = document.createElement("div");
                Object.assign(layerContainer.style, {
                    position: "relative", width: "100%", height: "100%",
                    display: "flex", justifyContent: "center", alignItems: "center"
                });

                const isComparisonActive = hasCompareControls && hasRef;

                // Reference (Background)
                if (isComparisonActive) {
                    const imgRef = document.createElement("img");
                    imgRef.src = refData.uri;
                    imgRef.className = "imgnr-ref-layer";
                    Object.assign(imgRef.style, {
                        position: "absolute", top: "-1px", left: "-1px",
                        width: "calc(100% + 2px)", height: "calc(100% + 2px)", objectFit: "contain",
                        display: "block",
                        zIndex: "0" 
                    });
                    layerContainer.appendChild(imgRef);
                }

                // Current (Foreground) - Uses placeholder if no current image exists
                const imgCur = document.createElement("img");
                imgCur.src = hasCurrent ? currentData.uri : new URL("./placeholder.png", import.meta.url).href;
                imgCur.className = "imgnr-cur-layer";
                Object.assign(imgCur.style, {
                    position: isComparisonActive ? "absolute" : "relative",
                    top: "-1px", left: "-1px", background: "var(--component-node-widget-background)",
                    width: "calc(100% + 2px)", height: "calc(100% + 2px)", objectFit: "contain",
                    display: "block",
                    zIndex: "10"
                });
                
                // Slider Clipping
                if (isComparisonActive && node.sliderVal !== undefined) {
                    const pct = node.sliderVal; 
                    imgCur.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
                } else {
                    imgCur.style.clipPath = "none";
                }
                
                layerContainer.appendChild(imgCur);
                imgHolder.appendChild(layerContainer);

                // 3. Update Compare Drawer State 
                if (hasCompareControls && node.comparisonWrapper) {
                    if (!hasRef) {
                        node.compOverlay.style.display = "block";
                        node.pinLeftBtn.style.border = "1px solid var(--input-text)";
                        node.blinkBtn.style.border = "1px solid var(--input-text)";
                        node.pinRightBtn.style.border = "1px solid var(--input-text)";
                        node.blinkBtn.style.color = "var(--input-text)";
                        node.diffBox.innerHTML = "<span style='opacity:0.5'>Nothing to compare...</span>";
                    } else {
                        node.compOverlay.style.display = "none";
                        node.pinLeftBtn.style.border = "1px solid var(--component-node-border)";
                        node.blinkBtn.style.border = "1px solid var(--component-node-border)";
                        node.pinRightBtn.style.border = "1px solid var(--component-node-border)";
                        node.blinkBtn.style.color = "var(--component-node-border)";
 
                        if (node.diffBox) {
                            if (hasCurrent) {
                                const diff = computeDiff(currentData.meta, refData.meta);
                                node.diffBox.innerHTML = diff ? diff : "<span style='opacity:0.5'>No Input Changes</span>";
                            } else {
                                node.diffBox.innerHTML = "<span style='opacity:0.5'>Waiting for new generation...</span>";
                            }
                        }
                    }
                }
                
                node.onResize?.(node.size);
                node.setDirtyCanvas(true, true);
            }

            // --- HELPER: Smart String Diff (Clean) ---
            function getSmartStringDiff(str1, str2) {
                if (str1 === str2) return null;
                let start = 0;
                while (start < str1.length && start < str2.length && str1[start] === str2[start]) start++;
                let end1 = str1.length - 1;
                let end2 = str2.length - 1;
                while (end1 >= start && end2 >= start && str1[end1] === str2[end2]) { end1--; end2--; }
                
                const diff1 = str1.slice(start, end1 + 1); // Current (Green)
                const diff2 = str2.slice(start, end2 + 1); // Previous (Red)
                const formatDiff = (d) => d.length > 40 ? d.slice(0, 15) + "..." + d.slice(-15) : d;

                const partOld = diff2 ? `<span style='color:#b24747; text-decoration:line-through'>${formatDiff(diff2)}</span>` : "";
                const partNew = diff1 ? `<span style='color:#47b247'>${formatDiff(diff1)}</span>` : "";
                
                if(partOld && partNew) return `${partOld} &rarr; ${partNew}`;
                if(partOld) return `${partOld} &rarr; (deleted)`;
                if(partNew) return `(added) &rarr; ${partNew}`;
                return null;
            }

            // --- HELPER: Compute Metadata Diff ---
            function computeDiff(curr, ref) {
                if (!curr || !ref || !curr.prompt || !ref.prompt) return "";
                let changes = [];
                const extractPrimitives = (p) => {
                    let primitives = {};
                    for (let key in p) {
                        const inputs = p[key].inputs;
                        if (!inputs) continue;
                        for (let k in inputs) {
                            const val = inputs[k];
                            if (val !== null && typeof val !== 'object' && !Array.isArray(val)) primitives[k] = val;
                        }
                    }
                    return primitives;
                };

                const p1 = extractPrimitives(curr.prompt);
                const p2 = extractPrimitives(ref.prompt);

                for (let k in p1) {
                    if (p2[k] !== undefined && p1[k] != p2[k]) { 
                        let val1 = p1[k]; let val2 = p2[k];
                        if (typeof val1 === 'string' && typeof val2 === 'string' && val1.length > 20) {
                            const smartDiff = getSmartStringDiff(val1, val2);
                            if (smartDiff) changes.push(`<b style='color:var(--component-node-border)'>${k}</b>: ${smartDiff}`);
                        } else {
                            changes.push(`<b style='color:var(--component-node-border)'>${k}</b>: <span style='color:#b24747'>${val2}</span> &rarr; <span style='color:#47b247'>${val1}</span>`);
                        }
                    }
                }
                return changes.join("<br>");
            }

            // --- 2. AUTO-RESIZE NODE ---
            function setNodeSizeToImage(node) {
                if (!node.previewContainerElement) return;
                const resizeMode = node.widgets?.find(w => w.name === "Resize Behavior")?.value;
                if (resizeMode !== "Resize Node to Image") {
                    node.onResize?.(node.size);
                    node.setDirtyCanvas(true, true);
                    return;
                }

                // Fallback to Reference Image dimensions if Current is missing
                let data = node.persistedImageData;
                if (!data || data.width === 0) {
                    data = node.persistedRefData;
                }
                
                if (!data || data.width === 0) return;

                const widthPadding = 20;
                let baseH = hasSaveControls ? 336 : 80; 
                
                if (node.infoBar && node.infoBar.style.display !== 'none') baseH += 25;
                if (hasCompareControls && node.comparisonWrapper && node.comparisonWrapper.style.display !== 'none') {
                    baseH += node.comparisonWrapper.offsetHeight + 60;
                }
                if (hasSaveControls) baseH += 65;

                const targetWidth = data.width + widthPadding;
                const targetHeight = data.height + baseH;

                if (Math.abs(node.size[0] - targetWidth) > 5 || Math.abs(node.size[1] - targetHeight) > 5) {
                    node.setSize([targetWidth, targetHeight]);
                }
                
                node.onResize?.(node.size);
                node.setDirtyCanvas(true, true);
            }

            // --- 3. SETUP ---
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                
                this.previewContainerElement = null;
                if (!this.properties) this.properties = {};
                
                if (!this.properties.imgnr_session_id) {
                    this.properties.imgnr_session_id = Math.random().toString(36).substring(2, 15);
                }
                
                this.sliderVal = 50; 
                this.isPinned = false; 

                const startHeight = hasSaveControls ? 460 : 320;
                this.size = [this.size[0], startHeight];

                const existingWidget = this.widgets?.find(w => w.name === "Resize Behavior");
                if (!existingWidget) {
                    this.addWidget("combo", "Resize Behavior", "Fit Image to Node", (v) => {
                        if (v === "Resize Node to Image") setNodeSizeToImage(this);
                    }, { values: ["Fit Image to Node", "Resize Node to Image"] });
                }

                const previewContainer = document.createElement("div");
                previewContainer.className = "imgnr-preview-widget-container";
                Object.assign(previewContainer.style, {
                    width: "100%", position: "relative", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", marginTop: "4px", marginBottom: "4px",
                    background: "var(--component-node-widget-background)" 
                });

                const imgHolder = document.createElement("div");
                imgHolder.className = "imgnr-img-holder";
                Object.assign(imgHolder.style, {
                    display:"flex", alignItems:"center", justifyContent:"center", 
                    width:"100%", height:"100%", overflow:"hidden", border: "1px solid var(--component-node-widget-background)",
                    flexGrow: "1", flexShrink: "1", minHeight: "256px", minWidth: "256px",
                    position: "relative"
                });
                previewContainer.appendChild(imgHolder);
                this.previewContainerElement = previewContainer;

                // --- INFO BAR ---
                const infoBar = document.createElement("div");
                Object.assign(infoBar.style, {
                    width: "100%", height: "24px", minHeight: "24px", flexShrink: "0",
                    position: "relative", display: "none",
                    background: "var(--component-node-background)", fontSize: "var(--comfy-textarea-font-size)",
                    color: "var(--border-color)", fontFamily: "Inter, Arial, sans-serif",
                });

                const dimsLabel = document.createElement("span");
                dimsLabel.textContent = "";
                Object.assign(dimsLabel.style, {
                    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", whiteSpace: "nowrap"
                });
                this.dimsLabel = dimsLabel;

                infoBar.appendChild(dimsLabel);
                this.infoBar = infoBar;
                previewContainer.appendChild(infoBar);

                // --- COMPARISON WRAPPER ---
                if (hasCompareControls) {

                    const compOverlay = document.createElement("div");
                    Object.assign(compOverlay.style, { 
                        background: "transparent", position: "absolute", left: "0", width: "100%", height: "80px"                        
                    });
                    compOverlay.title = "Comparison Tools currently unavailable";

                    const compWrapper = document.createElement("div");
                    Object.assign(compWrapper.style, { 
                        width: "100%", display: "flex", flexDirection: "column", flexShrink: "0",
                        background: "var(--component-node-background)"
                    });
                    
                    const compControls = document.createElement("div");
                    Object.assign(compControls.style, {
                        width: "100%", padding: "4px 6px", height: "35px", flexShrink: "0",
                        display: "flex", flexDirection: "row", alignItems: "center", 
                        justifyContent: "space-between", gap: "5px"
                    });
                    
                    this.updatePinVisual = () => {
                        const hasRef = (this.persistedRefData && this.persistedRefData.uri);
                        
                        // 1. Dynamic Background for Pin Right button
                        if (!hasRef) {
                            this.pinRightBtn.style.background = "var(--node-icon-disabled)";
                        } else {
                            this.pinRightBtn.style.background = "var(--component-node-widget-background)";
                        }

                        // 2. Sync basic pinned state
                        this.properties["imgnr_is_pinned"] = this.isPinned;

                        // 3. Automatically Lock/Unlock to JSON based on Pin state
                        if (this.isPinned && hasRef) {
                            this.properties["imgnr_locked_ref_data"] = this.persistedRefData;
                        } else {
                            delete this.properties["imgnr_locked_ref_data"];
                        }

                        if (this.isPinned) {
                            this.pinRightBtn.style.color = "#47b247";          
                            this.pinRightBtn.textContent = "REFERENCE ♺";
                            this.pinRightBtn.title = "Right Image is Locked to JSON. \nClick to set Left Image as NEW Reference";
                            this.pinLeftBtn.style.color = "#b24747";
                            this.pinLeftBtn.textContent = "✘ CURRENT";
                            this.pinLeftBtn.title = "Left Image will be dropped. \nClick to set Left Image as NEW Reference";
                        } else {
                            this.pinRightBtn.style.color = "#b24747";
                            this.pinRightBtn.textContent = "REFERENCE ✘";
                            this.pinRightBtn.title = "Right Image is disposable. \nClick to lock Right Image to Workflow JSON";
                            this.pinLeftBtn.style.color = "#47b247";          
                            this.pinLeftBtn.textContent = "↪ CURRENT";
                            this.pinLeftBtn.title = "Left Image will become NEW Reference. \nClick to keep Right Image as Reference";                            
                        }
                    };

                    // Pin LEFT
                    const pinLeftBtn = document.createElement("button");
                    pinLeftBtn.textContent = "↪ CURRENT";
                    Object.assign(pinLeftBtn.style, { 
                        cursor: "pointer", borderRadius: "4px", padding: "0px 5px", background: "var(--component-node-widget-background)",
                        fontSize: "var(--comfy-textarea-font-size)", color: "#47b247", border: "1px solid var(--input-text)", 
                        textAlign: "center", width: "100px",  height: "100%", fontFamily: "Inter, Arial, sans-serif", transition: "all 0.1s"
                    });
                    pinLeftBtn.onclick = () => {
                        if (this.persistedRefData && this.persistedRefData.uri) {
                            this.isPinned = !this.isPinned;
                            this.updatePinVisual();
                        }
                    };
                    this.pinLeftBtn = pinLeftBtn;

                    // Blink Button
                    const blinkBtn = document.createElement("button");
                    blinkBtn.textContent = "◩";
                    blinkBtn.title = "Hold to see Reference Image";
                    Object.assign(blinkBtn.style, { 
                        cursor: "pointer", borderRadius: "4px", padding: "0px 5px", background: "var(--component-node-widget-background)",
                        border: "1px solid var(--input-text)", fontSize: "20px", color: "var(--input-text)",
                        textAlign: "center", width: "auto",  height: "100%", transition: "all 0.1s"
                    });
                    const setOpacity = (val) => {
                        const curImg = imgHolder.querySelector(".imgnr-cur-layer");
                        if (curImg) curImg.style.opacity = val;
                        if (val == 0) {
                            this.blinkBtn.textContent = "◪";
                        } else {
                            this.blinkBtn.textContent = "◩"
                        }
                    };
                    blinkBtn.onmousedown = () => setOpacity("0");
                    blinkBtn.onmouseup = () => setOpacity("1");
                    blinkBtn.onmouseleave = () => setOpacity("1");
                    this.blinkBtn = blinkBtn;

                    // Pin RIGHT
                    const pinRightBtn = document.createElement("button");
                    pinRightBtn.textContent = "REFERENCE ✘";
                    Object.assign(pinRightBtn.style, { 
                        cursor: "pointer", borderRadius: "4px", padding: "0px 5px", background: "var(--component-node-widget-background)",
                        fontSize: "var(--comfy-textarea-font-size)", color: "#b24747", border: "1px solid var(--input-text)", 
                        textAlign: "center", width: "100px", height: "100%", fontFamily: "Inter, Arial, sans-serif", wordBreak: "break-word",
                        transition: "all 0.1s"
                    });
                    pinRightBtn.onclick = () => {
                        if (this.persistedRefData && this.persistedRefData.uri) {
                            this.isPinned = !this.isPinned;
                            this.updatePinVisual();
                        }
                    };
                    this.pinRightBtn = pinRightBtn;

                    compControls.appendChild(pinLeftBtn);
                    compControls.appendChild(blinkBtn);
                    compControls.appendChild(pinRightBtn);

                    const compSliders = document.createElement("div");
                    Object.assign(compSliders.style, {
                        width: "100%", padding: "4px", height: "20px", flexShrink: "0",
                        display: "flex", flexDirection: "row", alignItems: "center", 
                        justifyContent: "space-between", gap: "5px"
                    });
     
                    const slider = document.createElement("input");
                    slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.value = "50";
                    Object.assign(slider.style, { flexGrow: "1", cursor: "ew-resize", pointerEvents: "auto", accentColor: "var(--component-node-widget-advanced)" });
                    slider.oninput = (e) => {
                        this.sliderVal = e.target.value;
                        const curImg = imgHolder.querySelector(".imgnr-cur-layer");
                        if (curImg) {
                            curImg.style.clipPath = `inset(0 ${100 - this.sliderVal}% 0 0)`;
                        }
                    };
                    this.slider = slider;
                    
                    compSliders.appendChild(slider);
                    
                    const diffBox = document.createElement("div");
                    Object.assign(diffBox.style, {
                        width: "100%", fontSize: "10px", color: "var(--input-text)", flexShrink: "0",
                        textAlign: "left", padding: "6px", background: "var(--component-node-background)", 
                        whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.3"
                    });
                    
                    compWrapper.appendChild(compSliders);
                    compWrapper.appendChild(compControls);
                    compWrapper.appendChild(diffBox);
                    compWrapper.appendChild(compOverlay);
                    this.comparisonWrapper = compWrapper;
                    this.diffBox = diffBox;
                    this.compOverlay = compOverlay;
                                        
                    previewContainer.appendChild(compWrapper);
                }

                // --- SAVE CONTROLS ---
                if (hasSaveControls) {
                    const controls = document.createElement("div");
                    Object.assign(controls.style, {
                        width: "100%", padding: "6px 5px", flexShrink: "0",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                        background: "var(--component-node-background)"                        
                    });

                    const statusLabel = document.createElement("div");
                    Object.assign(statusLabel.style, {
                        marginBottom: "2px", textAlign: "center", width: "100%", 
                        fontSize: "var(--comfy-textarea-font-size)", color: "var(--input-text)", fontWeight: "bold", fontFamily: "Inter, Arial, sans-serif",
                        whiteSpace: "normal"
                    });
                    statusLabel.textContent = "IMAGE NOT SAVED"; 
                    controls.appendChild(statusLabel);

                    const saveBtn = document.createElement("button");
                    saveBtn.textContent = "SAVE NOW"; 
                    saveBtn.title = "Direct Save Image outside of workflow with current settings.";
                    Object.assign(saveBtn.style, { 
                        cursor: "pointer", fontSize: "var(--comfy-textarea-font-size)", padding: "4px 15px", width: "auto",
                        background: "var(--component-node-widget-background)", color: "var(--component-node-foreground)", fontWeight: "bold", fontFamily: "Inter, Arial, sans-serif",
                        border: "1px solid var(--component-node-border)", borderRadius: "4px"
                    });
                    controls.appendChild(saveBtn);
                    previewContainer.appendChild(controls);

                    const updateUIState = () => {
                        const autosave = this.widgets.find(w => w.name === "autosave")?.value;
                        if (this.savedFilename) {
                            let prefix = "SAVED:";
                            if (this.saveStatus === "overwritten") prefix = "File Exists, SAVED OVER:";
                            else if (this.saveStatus === "saved_as") prefix = "File Exists, SAVED AS:";

                            statusLabel.innerHTML = `${prefix}<br><span style="font-weight:normal; font-size:9px;">${this.savedFilename}</span>`;
                            statusLabel.style.color = "var(--input-text)"; 
                            statusLabel.title = this.savedFilename; 
                        } else {
                            statusLabel.style.color = "var(--input-text)"; 
                            statusLabel.title = "";
                            statusLabel.textContent = autosave ? "AUTOSAVE" : "IMAGE NOT SAVED";
                        }
                        saveBtn.disabled = !!autosave;
                        saveBtn.style.opacity = autosave ? "0.5" : "1";
                        saveBtn.style.cursor = autosave ? "default" : "pointer";
                    };
                    
                    const autosaveWidget = this.widgets.find(w => w.name === "autosave");
                    if (autosaveWidget) {
                        const cb = autosaveWidget.callback;
                        autosaveWidget.callback = (v) => { updateUIState(); if (cb) cb(v); };
                    }
                    
                    saveBtn.onclick = async () => {
                        const data = this.persistedImageData;
                        if (!data || !data.uri) return;
                        saveBtn.textContent = "Saving..."; saveBtn.disabled = true;
                        
                        const getVal = (name) => {
                            const inputSlot = this.inputs?.find(i => i.name === name);
                            if (inputSlot && inputSlot.link !== null) {
                                if (data.params && data.params[name] !== undefined) return data.params[name];
                            }
                            const widget = this.widgets?.find(w => w.name === name);
                            if (widget) return widget.value;
                            if (data.params && data.params[name] !== undefined) return data.params[name];
                            return undefined;
                        };

                        let counterVal = getVal("counter");
                        if (counterVal === undefined && data.current_counter !== undefined) {
                            counterVal = data.current_counter;
                        }

                        const payload = {
                            image: data.uri,
                            filename_main: getVal("filename_main"),
                            counter: counterVal,
                            add_counter: getVal("add_counter"),
                            filename_extras: getVal("filename_extras"),
                            overwrite: getVal("overwrite")
                        };
                        
                        try {
                            const resp = await api.fetchApi("/imgnr/save_manual", { method: "POST", body: JSON.stringify(payload) });
                            const result = await resp.json();
                            if (result.success) {
                                saveBtn.textContent = "Saved!";
                                const cntWidget = this.widgets.find(w => w.name === "counter");
                                if (cntWidget) cntWidget.value = result.new_counter;
                                this.savedFilename = result.relative_path;
                                this.saveStatus = result.save_status;
                                updateUIState();
                            } else {
                                alert("Save Failed: " + result.message); saveBtn.textContent = "Error";
                            }
                        } catch (e) { saveBtn.textContent = "Error"; }
                        
                        setTimeout(() => { 
                             if (!saveBtn.disabled) saveBtn.textContent = "SAVE NOW"; 
                             else if (saveBtn.disabled && !this.widgets.find(w => w.name === "autosave")?.value) {
                                saveBtn.textContent = "SAVE NOW"; saveBtn.disabled = false;
                             } else { saveBtn.textContent = "SAVE NOW"; }
                        }, 2000);
                    };

                    requestAnimationFrame(() => updateUIState());
                    this.updateUIState = updateUIState; 
                }

                this.previewWidget = this.addDOMWidget("base64Preview", "div", previewContainer, {});
                requestAnimationFrame(() => ensureImageExists(this));
            };

            // --- 4. PREVENT OVER-SQUISHING ON RESIZE ---
            const onResize = nodeType.prototype.onResize;
            nodeType.prototype.onResize = function (size) {
                onResize?.apply(this, arguments);
                let baseNodeOffset = hasSaveControls ? 336 : 100;
                let minH = baseNodeOffset + 256; 
                
                if (this.infoBar && this.infoBar.style.display !== 'none') minH += 25;
                if (hasCompareControls && this.comparisonWrapper && this.comparisonWrapper.style.display !== 'none') {
                    minH += this.comparisonWrapper.offsetHeight || 110; 
                }
                if (hasSaveControls) minH += 65; 

                if (size[1] < minH) size[1] = minH;
                if (size[0] < 276) size[0] = 276;
            };

            // --- 5. CLEANUP MEMORY ON DELETE ---
            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function () {
                onRemoved?.apply(this, arguments);
            };

            // --- 6. CONFIGURE (RELOAD FROM TABS OR JSON) ---
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                onConfigure?.apply(this, arguments);
                
                // 1. Restore locked Pin State
                if (this.properties?.imgnr_is_pinned !== undefined) {
                    this.isPinned = this.properties.imgnr_is_pinned;
                }

                // 2. Restore locked Reference Image (Only if it was pinned)
                if (this.properties?.imgnr_locked_ref_data) {
                    this.persistedRefData = this.properties.imgnr_locked_ref_data;
                }

                // 3. Restore session images (Survives Tab Switching ONLY)
                const sessionId = this.properties?.imgnr_session_id;
                if (sessionId) {
                    const cachedData = sessionImageCache.get(sessionId);
                    if (cachedData) {
                        if (cachedData.current) this.persistedImageData = cachedData.current;
                        // Only load session reference if we aren't already pinned/locked
                        if (!this.isPinned && cachedData.ref) {
                            this.persistedRefData = cachedData.ref;
                        }
                    }
                }
                
                requestAnimationFrame(() => {
                    ensureImageExists(this);
                    setNodeSizeToImage(this);
                });
            };

            // --- 7. EXECUTED (NEW IMAGE GENERATED) ---
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const container = this.previewContainerElement;
                if (!container) return;

                if (message?.imgnr_b64_previews?.length) {
                    const info = message.imgnr_b64_previews[0];
                    if (info.image) {
                        const newPayload = {
                            uri: info.image,
                            width: info.width || 0,
                            height: info.height || 0,
                            params: info.params || {},
                            current_counter: info.current_counter,
                            meta: info.meta 
                        };

                        // Comparison specific logic
                        if (hasCompareControls) {
                            if (!this.isPinned && this.persistedImageData) {
                                 this.persistedRefData = this.persistedImageData;
                            }
                            
                            // Immediately sync to JSON if we are pinned
                            if (this.isPinned && this.persistedRefData) {
                                this.properties["imgnr_locked_ref_data"] = this.persistedRefData;
                            }
                        } else {
                            this.persistedRefData = null;
                        }
                        
                        this.persistedImageData = null; 
                        this.persistedImageData = newPayload;

                        if (this.properties.imgnr_session_id) {
                            sessionImageCache.set(this.properties.imgnr_session_id, {
                                current: this.persistedImageData,
                                ref: this.persistedRefData
                            });
                        }
                        
                        delete this.properties["imgnr_persist_data"];
                        
                        if (hasSaveControls) {
                            if (info.current_counter !== undefined) {
                                const cntWidget = this.widgets.find(w => w.name === "counter");
                                if (cntWidget) cntWidget.value = info.current_counter;
                            }
                            this.savedFilename = info.saved_filename || null;
                            this.saveStatus = info.save_status || null;
                            if (this.updateUIState) this.updateUIState();
                        }
                    }
                }
                
                ensureImageExists(this);
                setNodeSizeToImage(this);
            };
        }
    },
});