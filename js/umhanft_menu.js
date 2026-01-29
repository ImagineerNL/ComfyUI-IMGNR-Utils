// IMGNR-Utils/UMHANFT
// Fixes: Settings to general settings file IMGNR_settings.js
// Fixes: text match search for missing nodes; debug mode
// =========================================================
// FEATURE: Dynamic Node alternative search

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const style = document.createElement("style");
style.innerHTML = `
    .litecontextmenu .litemenu-entry.umhanft-header { color: #08B5A7 !important; font-weight: bold; opacity: 1.0 !important; }
    .litecontextmenu .litemenu-entry.umhanft-item { color: var(--p-button-text-color, white) !important; }
`;
document.head.appendChild(style);

app.registerExtension({
    name: "Comfy.UMHANFT.Main",
    async setup() {
        const PREFIX = "IMGNR"; // Matches settings.js

        // Feature Toggle Check
        const enabled = app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.Enabled`);
        if (!enabled) return;

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.classList?.contains("litecontextmenu")) {
                        const isNodeMenu = node.innerText.includes("Title") || 
                                         node.innerText.includes("Properties") || 
                                         node.innerText.includes("Inputs") ||
                                         node.innerText.includes("Outputs");

                        if (!isNodeMenu || app.canvas.active_widget) return;
                        if (node.innerText.includes("Filter list")) return;
                        
                        const allMenus = document.querySelectorAll(".litecontextmenu");
                        if (allMenus.length > 1 || node.innerText.includes("UMightHaveANodeForThat")) return;
                        
                        injectUMHANFTOptions(node);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true });

        async function injectUMHANFTOptions(menuElement) {
            // [UI FIX] Shift menu up by 50px to prevent bottom overflow
            if (menuElement.style.top) {
                const currentTop = parseInt(menuElement.style.top, 10);
                if (!isNaN(currentTop)) {
                    menuElement.style.top = `${Math.max(0, currentTop - 50)}px`;
                }
            }

            const canvas = app.canvas;
            const pos = canvas.graph_mouse;
            const targetNode = canvas.graph.getNodeOnPos(pos[0], pos[1]);
            if (!targetNode) return;

            // Fetch settings
            const response = await api.fetchApi("/umhanft/find_alternatives", {
                method: "POST",
                body: JSON.stringify({ 
                    node_type: targetNode.type, 
                    node_title: targetNode.title || targetNode.type,
                    neighbors: {
                        required_inputs: targetNode.outputs?.flatMap(o => o.links?.map(l => app.graph.links[l]?.type).filter(Boolean)) || [],
                        provided_outputs: targetNode.inputs?.map(i => app.graph.links[i.link]?.type).filter(Boolean) || []
                    },
                    strict: app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.StrictMatch`),
                    strict_connected: app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.StrictConnected`),
                    min_score: app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.MinScore`),
                    max_alts: app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.MaxAlternatives`),
                    debug_enabled: app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.DebugEnabled`),
                    debug_node_text: app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.DebugNodeName`),
                    live_sig: {
                        input_types: targetNode.inputs?.map(i => i.type) || [],
                        output_types: targetNode.outputs?.map(o => o.type) || []
                    }
                }),
            });
            const data = await response.json();

            const separator = document.createElement("div");
            separator.className = "litemenu-entry separator";
            menuElement.appendChild(separator);

            const item = document.createElement("div");
            item.className = "litemenu-entry umhanft-item";
            item.innerText = `🔍 UMightHaveANodeForThat (${data.count})`;
            item.style.cursor = "pointer";
            item.addEventListener("click", (e) => {
                menuElement.remove();
                if (data.count === 0) return;

                const scoringType = app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.ScoringType`);
                const menuItems = [
                    { content: "--- UMightHaveANodeForThat ---", disabled: true, className: "umhanft-header" },
                    { content: `Current: ${targetNode.title || targetNode.type} ${data.current_pack}`, disabled: true, className: "umhanft-header" },
                    { content: "Select from list to spawn a copy", disabled: true, className: "umhanft-header" },
                    null
                ];

                data.alternatives.forEach(alt => {
                    const displayScore = scoringType === "Percentage" ? `${alt.score}%` : `${alt.raw_score}`;
                    menuItems.push({
                        content: `${alt.display} (${displayScore})`,
                        callback: () => {
                            const newNode = LiteGraph.createNode(alt.name);
                            newNode.pos = [targetNode.pos[0] + 60, targetNode.pos[1] + 60];
                            app.graph.add(newNode);
                        }
                    });
                });

                new LiteGraph.ContextMenu(menuItems, { event: e });
            });
            menuElement.appendChild(item);
        }
    }
});