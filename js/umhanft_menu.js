// IMGNR-Utils/UMHANFT
// Fixes: Settings to general settings file IMGNR_settings.js
// Fixes: text match search for missing nodes; debug mode
// =========================================================
// FEATURE: Dynamic Node alternative search
// FIXED: Bulletproof Active/Bookmarked Extraction (checks title, type, settings API, and localStorage)
// DIAGNOSTIC: Added verbose console logs for array extraction
// NEW: Added bonus + marker for bookmarked or already present nodes

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

            // Gather active nodes on canvas (Store internal ID, comfyClass, and Display Title)
            const activeNodes = [];
            if (app.graph && app.graph._nodes) {
                app.graph._nodes.forEach(n => {
                    if (n) {
                        if (n.type) activeNodes.push(n.type);
                        if (n.title) activeNodes.push(n.title);
                        if (n.comfyClass) activeNodes.push(n.comfyClass);
                    }
                });
            }

            // Gather natively bookmarked nodes 
            let bookmarkedNodes = [];
            try {
                const tryAdd = (val) => {
                    if (Array.isArray(val)) {
                        val.forEach(v => {
                            if (typeof v === 'string') {
                                // V2 Stores paths (e.g. "MyFolder/NodeName") and dummy folders ending in "/"
                                if (v.endsWith('/')) return; // Ignore folders
                                const parts = v.split('/');
                                const nodeName = parts.pop(); // Get actual node name
                                if (nodeName) bookmarkedNodes.push(nodeName);
                            }
                            else if (v && v.id) bookmarkedNodes.push(v.id);
                            else if (v && v.name) bookmarkedNodes.push(v.name);
                            else if (v && v.type) bookmarkedNodes.push(v.type);
                        });
                    } else if (typeof val === 'string') {
                        bookmarkedNodes.push(val);
                    }
                };

                // 1. Check Native V2 Bookmarks
                tryAdd(app.ui.settings.getSettingValue("Comfy.NodeLibrary.Bookmarks.V2"));
                
                // 2. Check Legacy/Extension Bookmarks
                tryAdd(app.ui.settings.getSettingValue("Comfy.NodeLibrary.Favorites"));
                tryAdd(app.ui.settings.getSettingValue("Comfy.Favorites"));
                tryAdd(app.ui.settings.getSettingValue("pysssss.Favorites"));
                
                // 3. Fallback: Direct LocalStorage target (No scanning/looping)
                const rawV2 = localStorage.getItem("Comfy.Settings.Comfy.NodeLibrary.Bookmarks.V2") || 
                              localStorage.getItem("Comfy.NodeLibrary.Bookmarks.V2");
                if (rawV2) {
                    try { tryAdd(JSON.parse(rawV2)); } catch(e){}
                }

                // Remove duplicates
                bookmarkedNodes = [...new Set(bookmarkedNodes)];
            } catch(e) {
                console.warn("[UMHANFT] Non-critical error parsing bookmarks", e);
            }

            // Diagnostic Console Log
            if (app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.DebugEnabled`)) {
                console.log("[UMHANFT] Frontend Extraction:");
                console.log("  -> Active Nodes:", activeNodes);
                console.log("  -> Bookmarked Nodes:", bookmarkedNodes);
            }

            // Fetch settings & payload
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
                    },
                    active_nodes: activeNodes,
                    bookmarked_nodes: bookmarkedNodes
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
                // Inline SVG matching the solid bookmark UI icon
                const bookmarkSvg = `<svg style="vertical-align: -0.125em;" width="1em" height="1em" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M2.625 1.75C2.625 1.28587 2.80937 0.840752 3.13757 0.512563C3.46577 0.184374 3.91087 0 4.375 0H9.625C10.0891 0 10.5342 0.184374 10.8624 0.512563C11.1906 0.840752 11.375 1.28587 11.375 1.75V14L7 11.0833L2.625 14V1.75Z"/></svg>`;

                menuElement.remove();
                if (data.count === 0) return;

                const scoringType = app.ui.settings.getSettingValue(`${PREFIX}.UMHANFT.ScoringType`);
                const menuItems = [
                    { content: "--- UMightHaveANodeForThat ---", disabled: true, className: "umhanft-header" },
                    { content: `Current: ${targetNode.title || targetNode.type} ${data.current_pack}`, disabled: true, className: "umhanft-header" },
                    { content: "Select from list to spawn a copy", disabled: true, className: "umhanft-header" },
                    { content: `( ✔= In workflow; '${bookmarkSvg}'= Bookmarked )`, disabled: true, className: "umhanft-header" },
                    null
                ];

                
                data.alternatives.forEach(alt => {
                    const displayScore = scoringType === "Percentage" ? `${alt.score}%` : `${alt.raw_score}`;
                    
                    // Format prefix badges (Active first, then Bookmarked) using requested Color
                    const activeBadge = alt.is_active ? ` <span style="color: #08B5A7;">✔</span>` : "";
                    const bookmarkBadge = alt.is_bookmarked ? ` <span style="color: #08B5A7;">${bookmarkSvg}</span>` : "";

                    menuItems.push({
                        content: `${activeBadge}${bookmarkBadge} ${alt.display} (${displayScore})`,
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