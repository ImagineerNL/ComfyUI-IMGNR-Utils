// IMGNR-Utils/js/preview_image_base64.js
// Fixes: Transparant (RGBA) images (+ mask in/out)
// Fixes: Widget background now same as template node color
// Fixes: Zero size widget on spawn due to no image (using placeholder)
// New: Adhoc Save Node

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

app.registerExtension({
    name: "Comfy.PreviewImageBase64Node.JS",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        const isPreviewNode = nodeData.name === "PreviewImageBase64Node";
        const isSaveNode = nodeData.name === "PreviewImageAdHocSaveNode";

        if (isPreviewNode || isSaveNode) {

            // --- 1. VISUALIZATION ---
            function ensureImageExists(node) {
                if (!node.previewContainerElement) return;
                const imgHolder = node.previewContainerElement.querySelector(".imgnr-img-holder");
                if (!imgHolder) return;

                // Determine content: Real Data or Placeholder
                const data = node.persistedImageData || node.properties?.imgnr_persist_data;
                let src = "";

                if (data && data.uri) {
                    src = data.uri;
                } else {
                    // Placeholder relative to this script
                    src = new URL("./placeholder.png", import.meta.url).href;
                }

                // Render if changed or empty
                const currentImg = imgHolder.querySelector("img");
                if (!currentImg || currentImg.src !== src) {
                    imgHolder.innerHTML = "";
                    const img = document.createElement("img");
                    img.src = src;
                    Object.assign(img.style, {
                        maxWidth: "100%", maxHeight: "100%",
                        width: "auto", height: "auto",
                        objectFit: "contain", display: "block"
                    });
                    imgHolder.appendChild(img);
                }
            }

            // --- 2. AUTO-RESIZE (Node -> Image) ---
            // Only runs if "Resize Node to Image" is selected
            function setNodeSizeToImage(node) {
                if (!node.previewContainerElement) return;
                const resizeMode = node.widgets?.find(w => w.name === "Resize Behavior")?.value;
                if (resizeMode !== "Resize Node to Image") return;

                const data = node.persistedImageData || node.properties?.imgnr_persist_data;
                if (!data || data.width === 0) return;

                // Simple padding calculation
                const widthPadding = 20;
                // Height includes Header + Widgets + SaveControls
                const controlHeight = isSaveNode ? 240 : 60; 
                
                const targetWidth = data.width + widthPadding;
                const targetHeight = data.height + controlHeight;

                if (Math.abs(node.size[0] - targetWidth) > 5 || Math.abs(node.size[1] - targetHeight) > 5) {
                    node.setSize([targetWidth, targetHeight]);
                    node.setDirtyCanvas(true, true);
                }
            }

            // --- 3. SETUP ---
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                
                this.previewContainerElement = null;
                if (!this.properties) this.properties = {};
                this.savedFilename = null;

                // --- INITIAL SIZE ---
                // We set the node size manually once on creation to ensure it spawns "Open"
                const startHeight = isSaveNode ? 460 : 320;
                this.size = [this.size[0], startHeight];

                // Add Widget
                const existingWidget = this.widgets?.find(w => w.name === "Resize Behavior");
                if (!existingWidget) {
                    this.addWidget("combo", "Resize Behavior", "Fit Image to Node", (v) => {
                        if (v === "Resize Node to Image") setNodeSizeToImage(this);
                    }, { values: ["Fit Image to Node", "Resize Node to Image"] });
                }

                // Main Container
                const previewContainer = document.createElement("div");
                previewContainer.className = "imgnr-preview-widget-container";
                Object.assign(previewContainer.style, {
                    width: "100%", 
                    position: "relative", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    marginTop: "4px", marginBottom: "4px",
                    background: "var(--component-node-widget-background)" 
                });

                // Image Holder
                const imgHolder = document.createElement("div");
                imgHolder.className = "imgnr-img-holder";
                Object.assign(imgHolder.style, {
                    display:"flex", alignItems:"center", justifyContent:"center", 
                    width:"100%", height:"100%", overflow:"hidden", flexGrow: "1"
                });
                previewContainer.appendChild(imgHolder);
                this.previewContainerElement = previewContainer;

                // Save Controls
                if (isSaveNode) {
                    const controls = document.createElement("div");
                    Object.assign(controls.style, {
                        width: "100%", padding: "6px 5px",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                        background: "var(--component-node-widget-background)", 
                        borderTop: "1px solid var(--input-text)"
                    });

                    // Status
                    const statusLabel = document.createElement("div");
                    Object.assign(statusLabel.style, {
                        fontSize: "10px", fontWeight: "bold",
                        color: "#888", marginBottom: "2px",
                        textAlign: "center", width: "100%", 
                        whiteSpace: "normal", wordBreak: "break-all"
                    });
                    statusLabel.textContent = "IMAGE NOT SAVED"; 
                    controls.appendChild(statusLabel);

                    // Button
                    const saveBtn = document.createElement("button");
                    saveBtn.textContent = "💾 Save Now";
                    Object.assign(saveBtn.style, { cursor: "pointer", fontSize: "12px", padding: "4px 10px", width: "90%" });
                    controls.appendChild(saveBtn);
                    
                    previewContainer.appendChild(controls);

                    // UI State Helper
                    const updateUIState = () => {
                        const autosave = this.widgets.find(w => w.name === "autosave")?.value;
                        if (this.savedFilename) {
                            statusLabel.innerHTML = `SAVED:<br><span style="font-weight:normal; font-size:9px;">${this.savedFilename}</span>`;
                            statusLabel.style.color = "var(--input-text)"; 
                            statusLabel.title = this.savedFilename; 
                        } else {
                            statusLabel.style.color = "#888"; 
                            statusLabel.title = "";
                            statusLabel.textContent = autosave ? "AUTOSAVE" : "IMAGE NOT SAVED";
                        }
                        
                        saveBtn.disabled = !!autosave;
                        saveBtn.style.opacity = autosave ? "0.5" : "1";
                        saveBtn.style.cursor = autosave ? "default" : "pointer";
                    };
                    
                    // Hook Autosave Toggle
                    const autosaveWidget = this.widgets.find(w => w.name === "autosave");
                    if (autosaveWidget) {
                        const cb = autosaveWidget.callback;
                        autosaveWidget.callback = (v) => { updateUIState(); if (cb) cb(v); };
                    }
                    
                    // Save Action
                    saveBtn.onclick = async () => {
                        const data = this.persistedImageData;
                        if (!data || !data.uri) return;
                        saveBtn.textContent = "Saving..."; saveBtn.disabled = true;
                        
                        const getVal = (n) => this.widgets.find(w => w.name === n)?.value;
                        const payload = {
                            image: data.uri,
                            filename_main: getVal("filename_main"),
                            sequence: getVal("sequence"),
                            filename_extras: getVal("filename_extras"),
                            overwrite: getVal("overwrite")
                        };
                        
                        try {
                            const resp = await api.fetchApi("/imgnr/save_manual", { method: "POST", body: JSON.stringify(payload) });
                            const result = await resp.json();
                            if (result.success) {
                                saveBtn.textContent = "Saved!";
                                const seqWidget = this.widgets.find(w => w.name === "sequence");
                                if (seqWidget) seqWidget.value = result.new_sequence;
                                this.savedFilename = result.relative_path;
                                updateUIState();
                            } else {
                                alert("Save Failed: " + result.message); saveBtn.textContent = "Error";
                            }
                        } catch (e) { saveBtn.textContent = "Error"; }
                        
                        setTimeout(() => { 
                             if (!saveBtn.disabled) saveBtn.textContent = "💾 Save Now"; 
                             else if (saveBtn.disabled && !this.widgets.find(w => w.name === "autosave")?.value) {
                                saveBtn.textContent = "💾 Save Now"; saveBtn.disabled = false;
                             } else { saveBtn.textContent = "💾 Save Now"; }
                        }, 2000);
                    };

                    requestAnimationFrame(() => updateUIState());
                    this.updateUIState = updateUIState; 
                }

                this.previewWidget = this.addDOMWidget("base64Preview", "div", previewContainer, {});
                
                // Initial Placeholder Check
                requestAnimationFrame(() => ensureImageExists(this));
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                onConfigure?.apply(this, arguments);
                if (this.properties?.imgnr_persist_data) {
                    this.persistedImageData = this.properties.imgnr_persist_data;
                    requestAnimationFrame(() => setNodeSizeToImage(this));
                }
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const container = this.previewContainerElement;
                if (!container) return;

                if (message?.imgnr_b64_previews?.length) {
                    const info = message.imgnr_b64_previews[0];
                    if (info.image) {
                         const payload = {
                            uri: info.image,
                            width: info.width || 0,
                            height: info.height || 0
                        };
                        this.persistedImageData = payload;
                        this.properties["imgnr_persist_data"] = payload;
                        
                        if (isSaveNode) {
                            if (info.current_sequence !== undefined) {
                                const seqWidget = this.widgets.find(w => w.name === "sequence");
                                if (seqWidget) seqWidget.value = info.current_sequence;
                            }
                            this.savedFilename = info.saved_filename || null;
                            if (this.updateUIState) this.updateUIState();
                        }
                    }
                }
                
                setNodeSizeToImage(this);
                ensureImageExists(this);
            };
        }
    },
});