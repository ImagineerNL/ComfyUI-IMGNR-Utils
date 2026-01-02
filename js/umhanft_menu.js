import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// STYLING: Force Teal headers #08B5A7
const style = document.createElement("style");
style.innerHTML = `
    .litecontextmenu .litemenu-entry.umhanft-header {
        color: #08B5A7 !important;
        font-weight: bold;
        opacity: 1.0 !important;
    }
    .litecontextmenu .litemenu-entry.umhanft-item {
        color: var(--p-button-text-color, white) !important;
    }
`;
document.head.appendChild(style);

app.registerExtension({
    name: "Comfy.UMHANFT.Main",
    async setup() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.classList?.contains("litecontextmenu")) {
                        
                        // ULTIMATE ROOT CHECK:
                        // Context menus are added sequentially to the body.
                        // If there is more than one menu present, this NEW one is a submenu.
                        const allMenus = document.querySelectorAll(".litecontextmenu");
                        if (allMenus.length > 1) {
                            return; // Stop. We only inject into the first (root) menu.
                        }

                        // Safety fallback for self-injection
                        if (node.innerText.includes("UMightHaveANodeForThat")) return;
                        
                        injectUMHANFTOptions(node);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true });

        function adjustMenuPosition(menu) {
            const rect = menu.getBoundingClientRect();
            const overflow = (rect.top + rect.height) - window.innerHeight;
            if (overflow > 0) {
                menu.style.top = Math.max(0, rect.top - overflow - 12) + "px";
            }
        }

        async function injectUMHANFTOptions(menuElement) {
            const canvas = app.canvas;
            const pos = canvas.graph_mouse;
            const targetNode = canvas.graph.getNodeOnPos(pos[0], pos[1]);
            
            // Only proceed if clicking a node (blocks background right-clicks)
            if (!targetNode) return;

            const neighbors = { required_inputs: [], provided_outputs: [] };
            targetNode.outputs?.forEach(o => o.links?.forEach(l => {
                const link = app.graph.links[l];
                if (link) neighbors.required_inputs.push(link.type);
            }));
            targetNode.inputs?.forEach(i => {
                const link = app.graph.links[i.link];
                if (link) neighbors.provided_outputs.push(link.type);
            });

            const liveSig = {
                input_types: targetNode.inputs?.map(i => i.type) || [],
                output_types: targetNode.outputs?.map(o => o.type) || []
            };

            const response = await api.fetchApi("/umhanft/find_alternatives", {
                method: "POST",
                body: JSON.stringify({ 
                    node_type: targetNode.type, 
                    node_title: targetNode.title || targetNode.type,
                    neighbors: neighbors,
                    live_sig: liveSig
                }),
            });
            const data = await response.json();

            const separator = document.createElement("div");
            separator.className = "litemenu-entry separator";
            menuElement.appendChild(separator);

            const findText = `🔍 UMightHaveANodeForThat (${data.count})`;
            menuElement.appendChild(createMenuItem(findText, async (e) => {
                // Remove the root menu immediately before spawning our results
                menuElement.remove();
                if (data.count === 0) { alert("UMHANFT: No matches found."); return; }

                const menuItems = [
                    { content: "--- UMightHaveANodeForThat ---", disabled: true, className: "umhanft-header" },
                    { content: "Click node in list to spawn:", disabled: true, className: "umhanft-header" },
                    { content: `Current: ${targetNode.title || targetNode.type} ${data.current_pack}`, disabled: true, className: "umhanft-header" },
                    null
                ];

                data.alternatives.forEach(alt => {
                    menuItems.push({
                        content: `${alt.display} (${alt.score}%)`,
                        callback: () => {
                            const newNode = LiteGraph.createNode(alt.name);
                            newNode.pos = [targetNode.pos[0] + 60, targetNode.pos[1] + 60];
                            app.graph.add(newNode);
                        }
                    });
                });

                // Spawn our result list as a new ContextMenu
                const subMenu = new LiteGraph.ContextMenu(menuItems, { event: e });
                
                // Tag the result menu so the observer ignores it if it somehow triggers again
                subMenu.root.classList.add("submenu");
                adjustMenuPosition(subMenu.root); 
            }));

            adjustMenuPosition(menuElement);
        }

        function createMenuItem(text, onClick) {
            const el = document.createElement("div");
            el.className = "litemenu-entry umhanft-item";
            el.innerText = text;
            el.style.cursor = "pointer";
            el.addEventListener("click", onClick);
            el.addEventListener("mouseenter", () => el.style.backgroundColor = "var(--p-button-hover-bg, #555)");
            el.addEventListener("mouseleave", () => el.style.backgroundColor = "transparent");
            return el;
        }
    }
});