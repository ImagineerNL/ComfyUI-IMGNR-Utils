// MyUtilityPack/js/preview_image_base64.js
// VERSION: 1.0 - First Publish
// VERSION: 1.1 - Respect user's manual node width when resizing height.

import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PreviewImageBase64Node.JS",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PreviewImageBase64Node") {

            const originalComputeSize = nodeType.prototype.computeSize;
            nodeType.prototype.lastImageDimensions = { width: 0, height: 0 };

            // --- Helper function to calculate and set node size ---
            function resizeNode(node) {
                 if (!node.previewContainerElement) { return; }
                 const currentWidth = node.size[0];
                 const baseComputedHeight = originalComputeSize ? originalComputeSize.call(node)[1] : node.size[1];
                 const container = node.previewContainerElement;
                 const containerTop = container.offsetTop;
                 const containerWidth = container.clientWidth;
                 let newHeight = baseComputedHeight;
                 const imgWidth = node.lastImageDimensions.width;
                 const imgHeight = node.lastImageDimensions.height;
                 if (containerWidth > 0 && containerTop > 0 && imgWidth > 0 && imgHeight > 0) {
                     const imageAspectRatio = imgHeight / imgWidth;
                     const targetContainerHeight = containerWidth * imageAspectRatio;
                     const bottomMargin = 10;
                     const neededTotalHeight = containerTop + targetContainerHeight + bottomMargin;
                     newHeight = Math.max(baseComputedHeight, neededTotalHeight);
                 }
                 if (Math.abs(node.size[1] - newHeight) > 1 || Math.abs(node.size[0] - currentWidth) > 1 ) {
                     node.setSize([currentWidth, newHeight]);
                 }
                 app.graph.setDirtyCanvas(true, false);
            }

            // --- Node Creation: Setup Container
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                 onNodeCreated?.apply(this, arguments);
                 this.previewContainerElement = null; this.imageElement = null;
                 this.lastImageDimensions = { width: 0, height: 0 };
                 const previewContainer = document.createElement("div");
                 previewContainer.className = "imgnr-preview-widget-container";
                 previewContainer.style.width = "100%";
                 previewContainer.style.backgroundColor = "#222";
                 previewContainer.style.position = "relative";
                 previewContainer.style.display = "flex"; // for centering image
                 previewContainer.style.alignItems = "center";
                 previewContainer.style.justifyContent = "center";
                 previewContainer.style.overflow = "hidden"; // Important
                 previewContainer.style.border = "1px dashed #444";
                 previewContainer.style.marginTop = "4px";
                 previewContainer.style.marginBottom = "4px";
                 this.previewWidget = this.addDOMWidget("base64Preview", "div", previewContainer, {});
                 this.previewContainerElement = previewContainer;
                 requestAnimationFrame(() => resizeNode(this));
            };

            // --- Executed Handler (Stores dimensions, Creates Image, Schedules Resize) ---
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                 const container = this.previewContainerElement;
                 if (!container) { console.error("Preview container missing!"); return; }
                 container.innerHTML = ''; this.imageElement = null;
                 this.lastImageDimensions = { width: 0, height: 0 };

                 if (message?.imgnr_b64_previews?.length) {
                     const imageInfo = message.imgnr_b64_previews[0];
                     if (imageInfo.image?.startsWith('data:image/')) {
                         const dataUri = imageInfo.image;
                         this.lastImageDimensions.width = imageInfo.width || 0;
                         this.lastImageDimensions.height = imageInfo.height || 0;
                         try {
                            const img = document.createElement("img");
                            img.src = dataUri; img.alt = "Preview";
                            // Image styles needed to respect container bounds
                            img.style.maxWidth = "100%"; img.style.maxHeight = "100%";
                            img.style.width = "auto"; img.style.height = "auto";
                            img.style.objectFit = "contain"; img.style.display = "block";

                             container.appendChild(img); this.imageElement = img;
                         } catch (error) {
                              console.error("Error creating image element:", error); container.innerHTML = '<p style="color: #f55;">JS Error</p>';
                         }
                     } else {
                          console.warn("Invalid 'image' data URI in message."); container.innerHTML = '<p style="color: #f80;">Invalid data</p>';
                     }
                 } else {
                     console.log("No 'imgnr_b64_previews' data in message.");
                 }
                 requestAnimationFrame(() => resizeNode(this)); 
            };
            // --- Cleanup
            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function () {
                 this.previewWidget = null; this.previewContainerElement = null; this.imageElement = null;
                 this.lastImageDimensions = null;
                 onRemoved?.apply(this, arguments);
            };
        }
    },
});