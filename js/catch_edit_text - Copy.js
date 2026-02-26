// IMGNR-Utils/js/catch_edit_text.js
// Version: Status Color + Toggle 
// Support Soft + Hard Mute
// Fix: Disabled native tooltip popup on text widget

import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.CatchEditTextNode.JS", 

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "CatchEditTextNode") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                const node = this;
                const actionWidget = node.widgets.find(w => w.name === "action");
                const colorToggleWidget = node.widgets.find(w => w.name === "use_status_color");

                // ---  DISABLE NATIVE BROWSER TOOLTIP ---
                // Prevents the full text content from popping up when hovering
                const textWidget = node.widgets.find(w => w.name === "editable_text_widget");
                if (textWidget && textWidget.inputEl) {
                    textWidget.inputEl.title = "";
                    Object.defineProperty(textWidget.inputEl, "title", {
                        get() { return ""; },
                        set(_) { }
                    });
                }
                // -------------------------------------------

                // --- HELPER: Set Upstream Mode & Visuals ---
                const updateStatus = () => {
                    const mode = actionWidget ? actionWidget.value : "use_input";
                    const useColor = colorToggleWidget ? colorToggleWidget.value : true;

                    // 1. Logic: Handle Upstream Mode
                    if (node.inputs && node.inputs[0] && node.inputs[0].link !== null) {
                        const linkInfo = app.graph.links[node.inputs[0].link];
                        if (linkInfo) {
                            const originNode = app.graph.getNodeById(linkInfo.origin_id);
                            if (originNode) {
                                // Hard Mute = Mode 2 (Never)
                                // Soft Mute & Input = Mode 0 (Always/Normal)
                                const targetMode = (mode === "use_edit_block_inputnode") ? 2 : 0;
                                
                                if (originNode.mode !== targetMode) {
                                    originNode.mode = targetMode;
                                }
                            }
                        }
                    }

                    // 2. Visuals: Update Title Bar Color
                    if (useColor) {
                        if (mode === "use_input") {
                            node.color = "#2d4a2d"; // Forest Green
                        } else if (mode === "use_edit_mute_input") {
                            node.color = "#5e5e24"; // Muted Gold/Olive
                        } else {
                            node.color = "#5e2424"; // Muted Red
                        }
                    } else {
                        // Reset to default theme color
                        node.color = undefined;
                    }

                    // Force Canvas Redraw
                    node.setDirtyCanvas(true, true);
                };

                // --- WIDGET CALLBACKS ---
                
                // 1. Action Dropdown Callback
                if (actionWidget) {
                    const originalCallback = actionWidget.callback;
                    actionWidget.callback = function (value) {
                        updateStatus();
                        if (originalCallback) {
                            return originalCallback.apply(this, arguments);
                        }
                    };
                }

                // 2. Color Toggle Callback
                if (colorToggleWidget) {
                    const originalCallback = colorToggleWidget.callback;
                    colorToggleWidget.callback = function (value) {
                        updateStatus();
                        if (originalCallback) {
                            return originalCallback.apply(this, arguments);
                        }
                    };
                }
                    
                // Trigger once on startup
                setTimeout(() => {
                    updateStatus();
                }, 100);

                return r;
            };

            // --- AUTO-SWITCH ON CONNECT ---
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info, ioSlot) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                
                // If connecting input (index 0), switch to "use_input"
                if (type === 1 && index === 0 && connected) {
                    const actionWidget = this.widgets.find(w => w.name === "action");
                    if (actionWidget && actionWidget.value !== "use_input") {
                        actionWidget.value = "use_input";
                        if (actionWidget.callback) actionWidget.callback("use_input");
                    }
                }
            };

            // --- UPDATE TEXT ON EXECUTE ---
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                 if (message?.text && Array.isArray(message.text) && message.text.length > 0) {
                    const newText = message.text[0];
                    const targetWidget = this.widgets.find(w => w.name === "editable_text_widget");
                    if (targetWidget && targetWidget.value !== newText) {
                        targetWidget.value = newText;
                    }
                }
            };
        } 
    }, 
});