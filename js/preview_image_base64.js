// MyUtilityPack/js/preview_image_base64.js
// VERSION: 1.0 - First Publish

import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.PreviewImageBase64Node.JS",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PreviewImageBase64Node") {

            // Store the original computeSize function if it exists
            const originalComputeSize = nodeType.prototype.computeSize;

            // Store image dimensions received from Python on the node instance
            nodeType.prototype.lastImageDimensions = { width: 0, height: 0 };

            // --- Helper function to calculate and set node size ---
            function resizeNode(node) {
                if (!node.previewContainerElement) { return; } // Exit if container not ready

                const baseSize = originalComputeSize ? originalComputeSize.call(node) : [...node.size];
                const nodeWidth = baseSize[0];
                const container = node.previewContainerElement;
                const containerTop = container.offsetTop;
                const containerWidth = container.clientWidth; // Actual width available

                let newHeight = baseSize[1]; // Start with base height

                // Get dimensions passed from Python
                const imgWidth = node.lastImageDimensions.width;
                const imgHeight = node.lastImageDimensions.height;

                // Calculate needed container height based on actual image ratio and container width
                if (containerWidth > 0 && containerTop > 0 && imgWidth > 0 && imgHeight > 0) {
                    const imageAspectRatio = imgHeight / imgWidth;
                    const targetContainerHeight = containerWidth * imageAspectRatio; // Height based on width and image ratio
                    const bottomMargin = 10;

                    const neededTotalHeight = containerTop + targetContainerHeight + bottomMargin;
                    newHeight = Math.max(baseSize[1], neededTotalHeight); // Ensure it's at least the base size

                } else {
                    // Fallback if dimensions are missing or container not ready
                    newHeight = baseSize[1]; // Use default height
                     console.log(`[PreviewImageBase64Node.JS] resizeNode: Container/Image dimensions not ready. Using BaseH=${newHeight}`);
                }

                // Apply the size only if it has changed significantly
                if (Math.abs(node.size[1] - newHeight) > 1 || Math.abs(node.size[0] - nodeWidth) > 1 ) {
                    node.setSize([nodeWidth, newHeight]);
                    console.log(`[PreviewImageBase64Node.JS] Applied node size: [${nodeWidth.toFixed(0)}, ${newHeight.toFixed(0)}]`);
                }
                 // Always request redraw after attempting resize calculation
                 app.graph.setDirtyCanvas(true, false);
            }


            // --- Node Creation: Setup Container
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                this.previewContainerElement = null; this.imageElement = null;
                this.lastImageDimensions = { width: 0, height: 0 }; // Initialize dimensions store

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
                console.log("[PreviewImageBase64Node.JS] Preview DOM widget added.");
                // Initial resize might use base size until first execution
                requestAnimationFrame(() => resizeNode(this));
            };

            // --- Executed Handler (Stores dimensions, Creates Image, Schedules Resize) ---
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                console.log(`[PreviewImageBase64Node.JS] onExecuted called.`);
                const container = this.previewContainerElement;
                if (!container) { console.error("[PreviewImageBase64Node.JS] Preview container missing!"); return; }
                container.innerHTML = ''; this.imageElement = null; // Clear first
                this.lastImageDimensions = { width: 0, height: 0 }; // Reset dimensions

                if (message?.imgnr_b64_previews && Array.isArray(message.imgnr_b64_previews) && message.imgnr_b64_previews.length > 0) {
                    const imageInfo = message.imgnr_b64_previews[0];
                    if (imageInfo.image && typeof imageInfo.image === 'string' && imageInfo.image.startsWith('data:image/')) {
                        const dataUri = imageInfo.image;
                        // --- Store received dimensions ---
                        this.lastImageDimensions.width = imageInfo.width || 0;
                        this.lastImageDimensions.height = imageInfo.height || 0;
                        // --------------------------------
                        console.log(`[PreviewImageBase64Node.JS] Creating image element. Received dims: ${imageInfo.width}x${imageInfo.height}`);
                        try {
                            const img = document.createElement("img");
                            img.src = dataUri; img.alt = "Preview";
                            // Image styles needed to respect container bounds
                            img.style.maxWidth = "100%"; img.style.maxHeight = "100%";
                            img.style.width = "auto"; img.style.height = "auto";
                            img.style.objectFit = "contain"; img.style.display = "block";
                            container.appendChild(img); this.imageElement = img;
                            console.log("[PreviewImageBase64Node.JS] Image element appended.");
                        } catch (error) {
                             console.error("[PreviewImageBase64Node.JS] Error creating image element:", error); container.innerHTML = '<p style="color: #f55;">JS Error</p>';
                        }
                    } else {
                         console.warn("[PreviewImageBase64Node.JS] Invalid 'image' data URI in message."); container.innerHTML = '<p style="color: #f80;">Invalid data</p>';
                    }
                } else {
                    console.log("[PreviewImageBase64Node.JS] No 'imgnr_b64_previews' data in UI message.");
                }

                // Schedule resize after content update / clear
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