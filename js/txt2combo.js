// IMGNR-Utils/Txt2Combo
// Due to heavy inspiration of code in the String Outputlist node by https://github.com/geroldmeisinger/ComfyUI-outputlists-combiner,
// the Txt2Combo Node and code is  licensed under the GPL-3.0 license 
// Extended to support Lookup Tables, Reverse Inspection, and Direct Save Button

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Helper: Recursively search for a list of strings in the definition object
function findValuesList(obj) {
    if (!obj) return null;
    if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === "string" && obj[0] !== "COMBO") return obj;
        for (let item of obj) {
            let found = findValuesList(item);
            if (found) return found;
        }
    }
    if (typeof obj === "object") {
        if (obj.values && Array.isArray(obj.values)) return obj.values;
        if (obj.options && Array.isArray(obj.options)) return obj.options;
        for (let key in obj) {
            if (typeof obj[key] === "object") {
                let found = findValuesList(obj[key]);
                if (found) return found;
            }
        }
    }
    return null;
}

app.registerExtension({
    name: "IMGNR.Txt2ComboWriter",

    // 1. Populate Mode (Backend -> Frontend)
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "Txt2ComboWriter") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                if (message?.text && Array.isArray(message.text) && message.text.length > 0) {
                    const targetWidget = this.widgets.find(w => w.name === "content");
                    if (targetWidget && targetWidget.value !== message.text[0]) {
                        targetWidget.value = message.text[0];
                        this.onResize?.(this.size); 
                    }
                }
            };
        }
    },

    // 2. JS Logic (Inspect + Save Button)
    async nodeCreated(node) {
        if (node.comfyClass === "Txt2ComboWriter") {
            
            // --- A. INSPECT LOGIC ---
            const inspectSlot = node.outputs.findIndex(o => o.name === "inspect");
            if (inspectSlot !== -1) {
                node.onConnectionsChange = async function (type, index, isConnected, linkInfo, self) {
                    if (index !== inspectSlot || !isConnected || !linkInfo) return;

                    const targetNode = app.graph.getNodeById(linkInfo.target_id);
                    if (!targetNode) return;

                    app.graph.removeLink(linkInfo.id);

                    const targetType = targetNode.type || targetNode.comfyClass || "";
                    console.log(`[Txt2Combo] Inspecting Node Type: ${targetType}`);

                    // Reverse Load
                    if (targetType.startsWith("Txt2Combo_")) {
                        try {
                            const response = await api.fetchApi(`/imgnr/txt2combo/get_node_data?class_name=${targetType}`);
                            if (response.ok) {
                                const data = await response.json();
                                const filenameWidget = node.widgets.find(w => w.name === "filename");
                                const contentWidget = node.widgets.find(w => w.name === "content");
                                if (filenameWidget) filenameWidget.value = data.filename;
                                if (contentWidget) contentWidget.value = data.content;
                                console.log(`[Txt2Combo] Loaded content from ${data.filename}`);
                            }
                        } catch (e) { console.error(e); }
                        return;
                    }

                    // Standard Inspect
                    const targetInputSlot = targetNode.inputs[linkInfo.target_slot];
                    const targetInputName = targetInputSlot.name;
                    if (targetInputName === "inspect") return;

                    try {
                        const info = await api.fetchApi(`/object_info/${targetType}`);
                        const json = await info.json();
                        let inputDef = json[targetType]?.input?.required?.[targetInputName] || json[targetType]?.input?.optional?.[targetInputName];
                        
                        if (inputDef) {
                            let values = findValuesList(inputDef);
                            if (values && values.length > 0) {
                                const contentWidget = node.widgets.find(w => w.name === "content");
                                if (contentWidget) contentWidget.value = values.map(String).join("\n");
                            }
                        }
                    } catch (e) { console.error(e); }
                };
            }

            // --- B. SAVE BUTTON ---
            
            // 1. Create Footer Container (Fixed Height)
            const footerHeight = 60;
            const footerHeight_padded = 75; // Padding needed to keep it from overflowing on bottom edge
            const container = document.createElement("div");
            container.className = "imgnr-txt2combo-controls";
            Object.assign(container.style, {
                width: "100%", 
                height: `${footerHeight}px`,  
                padding: "10px 5px 6px 5px",  
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                justifyContent: "space-between",
                gap: "2px",
                background: "var(--component-node-widget-background)", 
                borderTop: "1px solid var(--input-text)",
                boxSizing: "border-box",      
                overflow: "hidden"            
            });

            // 2. Status Label
            const statusLabel = document.createElement("div");
            Object.assign(statusLabel.style, {
                fontSize: "10px", fontWeight: "bold",
                color: "#888", 
                textAlign: "center", width: "100%", 
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                height: "14px", lineHeight: "14px"
            });
            statusLabel.textContent = "READY TO SAVE"; 
            container.appendChild(statusLabel);

            // 3. Save Button
            const saveBtn = document.createElement("button");
            saveBtn.textContent = "Write File";
            Object.assign(saveBtn.style, { 
                cursor: "pointer", fontSize: "12px", padding: "4px 10px", width: "90%",
                height: "26px",  
                marginTop: "2px"
            });
            container.appendChild(saveBtn);

            // 4. Click Handler
            saveBtn.onclick = async () => {
                const getVal = (n) => node.widgets.find(w => w.name === n)?.value;
                const payload = {
                    filename: getVal("filename") || getVal("select_file"),
                    content: getVal("content"),
                    mode: getVal("mode")
                };
                const selectFileVal = getVal("select_file");
                if (selectFileVal && !selectFileVal.startsWith("Create New")) {
                    payload.filename = selectFileVal;
                } else {
                    payload.filename = getVal("filename");
                }

                saveBtn.textContent = "Writing..."; 
                saveBtn.disabled = true;

                try {
                    const resp = await api.fetchApi("/imgnr/txt2combo/save", { 
                        method: "POST", 
                        body: JSON.stringify(payload) 
                    });
                    const result = await resp.json();

                    if (result.success) {
                        saveBtn.textContent = "Success";
                        statusLabel.style.color = "var(--input-text)";
                        
                        if (result.is_new) {
                            statusLabel.textContent = `Created: ${result.filename} (Restart Required)`;
                            statusLabel.title = `File created. Restart ComfyUI to show node: Txt2Combo ${result.filename}`;
                        } else {
                            statusLabel.textContent = `Updated: ${result.filename} (Refresh Node)`;
                            statusLabel.title = `File updated. Press (r) on Txt2Combo ${result.filename} node to refresh values.`;
                        }

                    } else {
                        saveBtn.textContent = "Error";
                        statusLabel.style.color = "red";
                        statusLabel.textContent = "Error: " + result.message;
                    }
                } catch (e) {
                    saveBtn.textContent = "API Error";
                    console.error(e);
                }

                setTimeout(() => { 
                    saveBtn.disabled = false; 
                    saveBtn.textContent = "Write File"; 
                }, 2000);
            };

            // 5. Add to Node & FIX SIZING
            const widget = node.addDOMWidget("writeButton", "div", container, {
                serialize: false,
                hideOnZoom: false
            });

            // CRITICAL: Tell LiteGraph explicitly how tall this widget is
            // This prevents overlapping and fixes the "Gap" calculation
            widget.computeSize = function(width) {
                return [width, footerHeight_padded];
            };

            // 6. Ensure Node is tall enough on creation
            requestAnimationFrame(() => {
                const minHeight = 240; // Approximate height for widgets + footer
                if (node.size[1] < minHeight) {
                    node.setSize([node.size[0], minHeight]);
                }
            });
        }
    }
});