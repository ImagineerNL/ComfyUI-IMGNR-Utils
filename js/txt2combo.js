// IMGNR-Utils/Txt2Combo
// Due to heavy inspiration of code in the String Outputlist node by https://github.com/geroldmeisinger/ComfyUI-outputlists-combiner,
// the Txt2Combo Node and code is  licensed under the GPL-3.0 license 
// New: Multiple combos per node 

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Helper: Recursively search for a list of strings in the definition object
function findValuesList(obj) {
    if (!obj) return null;
    
    // 1. Is the object ITSELF an array of strings?
    // e.g. ["a", "b", "c"]
    if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === "string" && obj[0] !== "COMBO") {
            return obj;
        }
        // If it's an array but not strings (e.g. mixed), search inside
        for (let item of obj) {
            let found = findValuesList(item);
            if (found) return found;
        }
    }
    
    // 2. Is it an object containing the list?
    if (typeof obj === "object") {
        
        // Check for standard "values" key
        if (obj.values && Array.isArray(obj.values)) return obj.values;
        
        // Check for "options" key (The fix for your specific error)
        if (obj.options && Array.isArray(obj.options)) return obj.options;

        // Recursive search into other keys
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

    // 2. Inspect Mode (Frontend -> Frontend)
    async nodeCreated(node) {
        if (node.comfyClass === "Txt2ComboWriter") {
            const inspectSlot = node.outputs.findIndex(o => o.name === "inspect");
            if (inspectSlot === -1) { return; }

            node.onConnectionsChange = async function (type, index, isConnected, linkInfo, self) {
                if (index !== inspectSlot || !isConnected || !linkInfo) { return; }

                const targetNode = app.graph.getNodeById(linkInfo.target_id);
                if (!targetNode) { return; }

                // Disconnect immediately
                app.graph.removeLink(linkInfo.id);

                const targetInputSlot = targetNode.inputs[linkInfo.target_slot];
                const targetInputName = targetInputSlot.name;
                const targetClassName = targetNode.comfyClass;

                console.log(`[Txt2Combo] Inspecting: ${targetClassName} -> ${targetInputName}`);

                try {
                    const info = await api.fetchApi(`/object_info/${targetClassName}`);
                    const json = await info.json();

                    let inputDef = json[targetClassName]?.input?.required?.[targetInputName];
                    if (!inputDef) {
                        inputDef = json[targetClassName]?.input?.optional?.[targetInputName];
                    }

                    if (inputDef) {
                        console.log("[Txt2Combo] Raw Definition:", inputDef);

                        // Use the updated finder that looks for 'options' too
                        let values = findValuesList(inputDef);

                        if (values && values.length > 0) {
                            const contentWidget = node.widgets.find(w => w.name === "content");
                            if (contentWidget) {
                                // Ensure all items are strings
                                const stringValues = values.map(String);
                                contentWidget.value = stringValues.join("\n");
                                console.log(`[Txt2Combo] Populated ${values.length} items.`);
                            }
                        } else {
                            console.warn("[Txt2Combo] No list found (checked 'values' and 'options').");
                        }
                    } else {
                        console.warn("[Txt2Combo] Input definition not found.");
                    }
                } catch (e) {
                    console.error("[Txt2Combo] Inspection Error:", e);
                }
            };
        }
    }
});