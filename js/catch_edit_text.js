// MyUtilityPack/js/catch_edit_text.js
// VERSION: Updated log tags

import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.CatchEditTextNode.JS", // Using class name for uniqueness

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Check for the correct Python class name
        if (nodeData.name === "CatchEditTextNode") {

            // --- Store original functions ---
            const onExecuted = nodeType.prototype.onExecuted;
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            // --- Executed Handler (updates widget display) ---
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                 if (message?.text && Array.isArray(message.text) && message.text.length > 0) {
                    const newText = message.text[0];
                    const targetWidget = this.widgets.find(w => w.name === "editable_text_widget");
                    if (targetWidget) {
                        if (targetWidget.value !== newText) {
                            targetWidget.value = newText;
                            console.log(`[CatchEditTextNode.JS] Updated widget '${targetWidget.name}' value via onExecuted.`); // UPDATED tag
                        }
                    } else {
                         console.warn("[CatchEditTextNode.JS] Could not find widget named 'editable_text_widget' to update."); // UPDATED tag
                    }
                }
            };

            // --- Node Created Handler (attaches callback to action widget for muting) ---
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                const actionWidget = this.widgets.find(w => w.name === "action");

                if (actionWidget) {
                    const originalCallback = actionWidget.callback;
                    actionWidget.callback = (value) => {
                        originalCallback?.call(this, value);
                        console.log(`[CatchEditTextNode.JS] Action changed to: ${value}`); // UPDATED tag
                        const shouldMuteUpstream = (value === "use_edit_mute_input");
                        this.setInputMuted(0, shouldMuteUpstream);
                    };
                } else {
                     console.warn("[CatchEditTextNode.JS] Could not find 'action' widget to attach callback."); // UPDATED tag
                }
            };

             // --- Helper Function: Set Mute state (unchanged logic) ---
             nodeType.prototype.setInputMuted = function(inputIndex, shouldMute) {
                if (!this.inputs || inputIndex >= this.inputs.length) { console.warn(`[CatchEditTextNode.JS] setInputMuted: Invalid input index ${inputIndex}`); return; } // UPDATED tag
                const linkId = this.inputs[inputIndex].link;
                if (linkId === null || linkId === undefined) { console.log(`[CatchEditTextNode.JS] setInputMuted: Input ${inputIndex} is not connected.`); return; } // UPDATED tag
                const linkInfo = this.graph.links[linkId];
                if (!linkInfo) { console.warn(`[CatchEditTextNode.JS] setInputMuted: Could not find link info for link ID ${linkId}`); return; } // UPDATED tag
                const originNodeId = linkInfo.origin_id;
                const upstreamNode = this.graph.getNodeById(originNodeId);
                if (upstreamNode) {
                    const targetMode = shouldMute ? 2 : 0;
                    if (upstreamNode.mode !== targetMode) {
                        upstreamNode.mode = targetMode;
                        console.log(`[CatchEditTextNode.JS] setInputMuted: Set upstream node ${upstreamNode.id} mode to ${targetMode} (Muted: ${shouldMute})`); // UPDATED tag
                    } else {
                         console.log(`[CatchEditTextNode.JS] setInputMuted: Upstream node ${upstreamNode.id} mode already ${targetMode}.`); // UPDATED tag
                    }
                } else {
                    console.warn(`[CatchEditTextNode.JS] setInputMuted: Could not find upstream node with ID ${originNodeId}`); // UPDATED tag
                }
             };

        } // end if (nodeData.name === "CatchEditTextNode")
    }, // end beforeRegisterNodeDef
}); // end registerExtension