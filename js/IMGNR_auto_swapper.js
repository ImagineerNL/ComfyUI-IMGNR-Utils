// IMGNR-Utils/js/IMGNR_auto_swapper.js
// FEATURE: Right-Click Node Swapper & Zoom-to-Fit UX
// Overwrites the native "Swap Save/Preview Image" submenu to provide a unified list of Core and IMGNR nodes.
// Image data transfer logic seamlessly passes images between swapped nodes.

import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Comfy.IMGNR.AutoSwapper",
    
    // --- 1. ZOOM TO FIT LOGIC (Runs exactly once on initial load) ---
    async setup() {
        const PREFIX = "IMGNR";
        const originalLoadGraphData = app.loadGraphData;

        app.loadGraphData = async function (graphData, ...args) {
            // Let ComfyUI do its native load first
            const result = await originalLoadGraphData.apply(this, [graphData, ...args]);

            let doZoom = false;
            try {
                doZoom = app.ui.settings.getSettingValue(`${PREFIX}.UX.ZoomToFit`, false);
            } catch(e) { }

            if (doZoom && app.canvas && app.graph) {
                // Wait for layout to settle
                setTimeout(() => {
                    const nodes = app.graph._nodes;
                    if (!nodes || nodes.length === 0) return;

                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                    for (const n of nodes) {
                        minX = Math.min(minX, n.pos[0]);
                        minY = Math.min(minY, n.pos[1]);
                        maxX = Math.max(maxX, n.pos[0] + (n.size ? n.size[0] : 200));
                        maxY = Math.max(maxY, n.pos[1] + (n.size ? n.size[1] : 100));
                    }

                    const padding = 100;
                    minX -= padding; minY -= padding; maxX += padding; maxY += padding;

                    const width = maxX - minX;
                    const height = maxY - minY;
                    const centerX = (minX + maxX) / 2;
                    const centerY = (minY + maxY) / 2;

                    const canvasEl = app.canvas.canvas;
                    const rect = canvasEl.getBoundingClientRect();
                    const viewW = rect.width || window.innerWidth;
                    const viewH = rect.height || window.innerHeight;

                    const scaleX = viewW / width;
                    const scaleY = viewH / height;
                    
                    let finalScale = Math.min(scaleX, scaleY);
                    finalScale = Math.max(0.1, Math.min(finalScale, 1.0)); 

                    app.canvas.ds.scale = finalScale;
                    app.canvas.ds.offset[0] = (viewW / 2 / finalScale) - centerX;
                    app.canvas.ds.offset[1] = (viewH / 2 / finalScale) - centerY;

                    app.canvas.setDirty(true, true);
                }, 100);
            }

            return result;
        };
    },

    // --- 2. RIGHT CLICK MENU REWRITER ---
    beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // Nodes allowed to trigger the menu
        const supportedNodes = ["PreviewImage", "SaveImage", "PreviewImageBase64Node", "PreviewImageAdHocSaveNode", "PreviewImageCompareNode"];

        if (supportedNodes.includes(nodeData.name)) {
            const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            
            nodeType.prototype.getExtraMenuOptions = function (_, options) {
                if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);

                // Check settings toggle
                let enableMenu = true;
                try {
                    enableMenu = app.ui.settings.getSettingValue("IMGNR.UX.EnableContextMenu", true);
                } catch(e) {}

                if (!enableMenu) return;

                // --- PERFORM SWAP LOGIC ---
                const performSwap = (targetType) => {
                    const canvas = app.canvas;
                    const graph = app.graph;
                    
                    // 1. Create the new node
                    const newNode = LiteGraph.createNode(targetType);
                    if (!newNode) return;

                    // 2. Match Layout & Colors
                    newNode.pos = [this.pos[0], this.pos[1]];
                    if (this.size) newNode.size = [this.size[0], this.size[1]];
                    if (this.color) newNode.color = this.color;
                    if (this.bgcolor) newNode.bgcolor = this.bgcolor;

                    // 3. Match Widgets (Crucial for retaining filename_prefix strings)
                    if (this.widgets && newNode.widgets) {
                        for (let i = 0; i < this.widgets.length; i++) {
                            if (newNode.widgets[i] && this.widgets[i].value !== undefined) {
                                newNode.widgets[i].value = this.widgets[i].value;
                            }
                        }
                    }

                    // 4. Image Data Transfer (So images don't vanish on swap)
                    // Transfer from Core Node -> IMGNR Node
                    if (this.imgs && this.imgs.length > 0) {
                        const url = this.imgs[0].src;
                        newNode.persistedImageData = {
                            uri: url,
                            width: this.imgs[0].naturalWidth || 0,
                            height: this.imgs[0].naturalHeight || 0,
                            params: {}
                        };
                    }
                    // Transfer from IMGNR Node -> IMGNR Node
                    if (this.persistedImageData) {
                        newNode.persistedImageData = this.persistedImageData;
                    }
                    // Transfer from IMGNR Node -> Core Node
                    if (this.persistedImageData && (targetType === "PreviewImage" || targetType === "SaveImage")) {
                        newNode.imgs = [new Image()];
                        newNode.imgs[0].src = this.persistedImageData.uri;
                    }

                    graph.add(newNode);

                    // 5. Reconnect Inputs
                    if (this.inputs) {
                        for (let i = 0; i < this.inputs.length; i++) {
                            const input = this.inputs[i];
                            if (input.link !== null) {
                                const link = graph.links[input.link];
                                if (link && newNode.inputs[i]) {
                                    const originNode = graph.getNodeById(link.origin_id);
                                    if (originNode) originNode.connect(link.origin_slot, newNode, i);
                                }
                            }
                        }
                    }

                    // 6. Reconnect Outputs
                    if (this.outputs) {
                        for (let i = 0; i < this.outputs.length; i++) {
                            const output = this.outputs[i];
                            if (output.links && output.links.length > 0) {
                                const links = [...output.links];
                                for (let j = 0; j < links.length; j++) {
                                    const link = graph.links[links[j]];
                                    if (link && newNode.outputs[i]) {
                                        const targetNode = graph.getNodeById(link.target_id);
                                        if (targetNode) newNode.connect(i, targetNode, link.target_slot);
                                    }
                                }
                            }
                        }
                    }

                    // 7. Delete Original safely
                    // Force close all UI menus before deleting the parent node to prevent ghosts
                    if (LiteGraph.closeAllContextMenus) {
                        LiteGraph.closeAllContextMenus();
                    }
                    
                    graph.remove(this);
                    canvas.setDirty(true, true);
                };

                // --- BUILD THE UNIFIED MENU ---
                const generateOptions = () => {
                    const list = [];
                    const currentType = this.type;

                    // Core: SaveImage / PreviewImage toggle
                    if (currentType === "SaveImage") {
                        list.push({ content: `➡️ Core: Preview Image`, callback: () => performSwap("PreviewImage") });
                    } else {
                        list.push({ content: `➡️ Core: Save Image`, callback: () => performSwap("SaveImage") });
                    }

                    list.push(null); // Separator

                    // IMGNR Specific Swaps
                    if (currentType !== "PreviewImageBase64Node") {
                        list.push({ content: `➡️ IMGNR: Preview (No Save)`, callback: () => performSwap("PreviewImageBase64Node") });
                    }
                    if (currentType !== "PreviewImageAdHocSaveNode") {
                        list.push({ content: `➡️ IMGNR: Preview (Ad-Hoc Save)`, callback: () => performSwap("PreviewImageAdHocSaveNode") });
                    }
                    if (currentType !== "PreviewImageCompareNode") {
                        list.push({ content: `➡️ IMGNR: Preview (Compare Lastgen)`, callback: () => performSwap("PreviewImageCompareNode") });
                    }

                    return list;
                };

                // --- INJECT AND OVERWRITE ---
                const targetSubmenuName = "↪️ Swap Save/Preview Image";
                const existingMenuIdx = options.findIndex(o => o && o.content && o.content.includes("Swap Save/Preview Image"));

                if (existingMenuIdx > -1) {
                    // Completely annihilate the original native object to destroy hidden event listeners
                    options.splice(existingMenuIdx, 1);
                }
                
                // Inject our 100% fresh, isolated object near the top
                options.splice(1, 0, {
                    content: targetSubmenuName,
                    has_submenu: true,
                    submenu: {
                        options: generateOptions()
                    }
                });
            };
        }
    }
});