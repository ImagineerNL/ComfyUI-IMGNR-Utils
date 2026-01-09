// IMGNR-Utils/js/preview_image_base64.js
// Fixes: "Resize Node to Image" now sets the node to the actual pixel dimensions of the image.
// Fixes: "Node minimizes when losing focus"

import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PreviewImageBase64Node.JS",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PreviewImageBase64Node") {

            const originalComputeSize = nodeType.prototype.computeSize;

            // --- 1. VISUAL RESTORATION
            function ensureImageExists(node) {
                const data = node.persistedImageData || node.properties?.imgnr_persist_data;
                
                if (!node.previewContainerElement || !data) return;

                if (node.previewContainerElement.childElementCount === 0) {
                    const img = document.createElement("img");
                    img.src = data.uri;
                    img.alt = "Preview";
                    
                    Object.assign(img.style, {
                        maxWidth: "100%",
                        maxHeight: "100%",
                        width: "auto",
                        height: "auto",
                        objectFit: "contain",
                        display: "block"
                    });
                    
                    node.previewContainerElement.appendChild(img);
                }
            }

            // --- 2. AUTO-SIZE LOGIC (100% Scale or Manual)
            function setNodeSizeToImage(node) {
                if (!node.previewContainerElement) return;

                // [CONTROL CHECK]
                const resizeMode = node.widgets?.find(w => w.name === "Resize Behavior")?.value;
                if (resizeMode !== "Resize Node to Image") {
                    // "Fit Image to Node" (Default) -> Do nothing.
                    return;
                }

                // Get Data
                const data = node.persistedImageData || node.properties?.imgnr_persist_data;
                if (!data) return;

                const imgWidth = data.width;
                const imgHeight = data.height;

                if (imgWidth > 0 && imgHeight > 0) {
                    // PADDING CONSTANTS
                    // Width: ~20px for node borders
                    // Height: ~60px for Header (30) + Widget (20) + Margin (10)
                    const widthPadding = 20;
                    const heightPadding = 60;

                    const targetWidth = imgWidth + widthPadding;
                    const targetHeight = imgHeight + heightPadding;

                    // Apply Size (Only if different)
                    if (Math.abs(node.size[0] - targetWidth) > 1 || Math.abs(node.size[1] - targetHeight) > 1) {
                        node.setSize([targetWidth, targetHeight]);
                        app.graph.setDirtyCanvas(true, false);
                    }
                }
            }

            // --- 3. NODE SETUP
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                
                this.previewContainerElement = null;
                this.persistedImageData = null; 
                if (!this.properties) this.properties = {};

                // --- WIDGET
                this.addWidget("combo", "Resize Behavior", "Fit Image to Node", (v) => {
                    if (v === "Resize Node to Image") {
                        setNodeSizeToImage(this);
                    }
                }, {
                    values: ["Fit Image to Node", "Resize Node to Image"]
                });

                // Create Container
                const previewContainer = document.createElement("div");
                previewContainer.className = "imgnr-preview-widget-container";
                Object.assign(previewContainer.style, {
                    width: "100%",
                    minHeight: "20px", 
                    backgroundColor: "#222",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    border: "1px dashed #444",
                    marginTop: "4px",
                    marginBottom: "4px"
                });

                this.previewWidget = this.addDOMWidget("base64Preview", "div", previewContainer, {});
                this.previewContainerElement = previewContainer;

                // Observer
                this.resizeObserver = new ResizeObserver(() => {
                    requestAnimationFrame(() => ensureImageExists(this));
                });
                this.resizeObserver.observe(previewContainer);
                
                // Visibility
                this.visibilityHandler = () => {
                     if (document.visibilityState === 'visible') {
                         setTimeout(() => requestAnimationFrame(() => ensureImageExists(this)), 50);
                     }
                };
                document.addEventListener("visibilitychange", this.visibilityHandler);
            };

            // --- 4. LOAD FROM SAVE
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                onConfigure?.apply(this, arguments);
                if (this.properties?.imgnr_persist_data) {
                    this.persistedImageData = this.properties.imgnr_persist_data;
                    requestAnimationFrame(() => setNodeSizeToImage(this));
                }
            };

            // --- 5. EXECUTION
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const container = this.previewContainerElement;
                if (!container) return;

                if (message?.imgnr_b64_previews?.length) {
                    const imageInfo = message.imgnr_b64_previews[0];
                    if (imageInfo.image?.startsWith('data:image/')) {
                         const payload = {
                            uri: imageInfo.image,
                            width: imageInfo.width || 0,
                            height: imageInfo.height || 0
                        };
                        this.persistedImageData = payload;
                        this.properties["imgnr_persist_data"] = payload;
                    }
                }
                
                container.innerHTML = ''; 
                setNodeSizeToImage(this); // Auto-size to 100% if enabled
                ensureImageExists(this);
            };

            // --- 6. CLEANUP
            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function () {
                if (this.resizeObserver) {
                    this.resizeObserver.disconnect();
                    this.resizeObserver = null;
                }
                if (this.visibilityHandler) {
                     document.removeEventListener("visibilitychange", this.visibilityHandler);
                }
                this.previewWidget = null;
                this.previewContainerElement = null;
                this.persistedImageData = null;
                onRemoved?.apply(this, arguments);
            };
        }
    },
});