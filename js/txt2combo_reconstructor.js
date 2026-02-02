// IMGNR-Utils/Txt2Combo Reconstructor
// Detects missing dynamic nodes and offers to repair them.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "IMGNR.Txt2ComboReconstructor",

    async setup() {
        const originalLoadGraphData = app.loadGraphData;
        app.loadGraphData = function (graphData) {
            const result = originalLoadGraphData.apply(this, arguments);
            // Log that we hooked in
            console.log("[Txt2Combo] Graph loaded. Queuing scan for missing nodes...");
            // Increased delay to 3000ms (3s) to ensure slow graphs are fully initialized
            setTimeout(() => checkForMissingNodes(), 3000);
            return result;
        };
    }
});

async function checkForMissingNodes() {
    console.log("[Txt2Combo] Scanning graph for missing Txt2Combo nodes...");
    const missingNodes = [];
    if (!app.graph || !app.graph._nodes) {
        console.log("[Txt2Combo] Graph not ready.");
        return;
    }
    
    for (const node of app.graph._nodes) {
        if (node.type.startsWith("Txt2Combo_")) {
            const nodeDef = LiteGraph.registered_node_types[node.type];
            
            if (!nodeDef) {
                console.log(`[Txt2Combo] Found missing node: ${node.type}`);
                
                let rawName = node.type.replace("Txt2Combo_", "");
                if (rawName.endsWith("_txt")) {
                    rawName = rawName.substring(0, rawName.length - 4) + ".txt";
                } else {
                    rawName += ".txt";
                }
                
                const headers = node.outputs ? node.outputs.map(o => o.name) : ["Column1"];

                missingNodes.push({
                    id: node.id,
                    type: node.type,
                    filename: rawName,
                    headers: headers
                });
            }
        }
    }

    if (missingNodes.length > 0) {
        console.log(`[Txt2Combo] Prompting recovery for ${missingNodes.length} nodes.`);
        const target = missingNodes[0]; 
        showRecoveryDialog(target);
    } else {
        console.log("[Txt2Combo] No missing Txt2Combo nodes found.");
    }
}

async function showRecoveryDialog(nodeInfo) {
    // 1. Check if file exists locally first
    let localExists = false;
    let localPath = "";
    try {
        const resp = await api.fetchApi("/imgnr/txt2combo/check_local_file", {
            method: "POST", body: JSON.stringify({ filename: nodeInfo.filename })
        });
        const data = await resp.json();
        localExists = data.exists;
        localPath = data.path;
    } catch(e) { console.error("Local check failed", e); }

    const dialog = document.createElement("dialog");
    Object.assign(dialog.style, {
        border: "1px solid #555", backgroundColor: "#222", color: "#ddd",
        padding: "20px", borderRadius: "8px", position: "fixed", 
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 10000, display: "flex", flexDirection: "column", gap: "10px",
        fontFamily: "Arial, sans-serif", maxWidth: "500px", boxShadow: "0 0 20px #000"
    });

    const h3 = document.createElement("h3");
    h3.textContent = "Missing Txt2Combo Node";
    h3.style.margin = "0 0 5px 0";
    h3.style.color = localExists ? "#ffcc00" : "#ff6666"; // Yellow warning if exists, Red if missing
    
    const p = document.createElement("p");
    p.style.lineHeight = "1.5";

    if (localExists) {
        p.innerHTML = `Node definition file <b>'${nodeInfo.filename}'</b> exists in <b>'${localPath}'</b> but cannot be loaded.<br><br>
        1. <b>Restart ComfyUI</b> to try loading it again.<br>
        2. If this message recurs, the definition might be corrupted.<br><br>
        Select an option below to <b>OVERWRITE</b> the existing file:`;
    } else {
        p.innerHTML = `The node <b>${nodeInfo.type}</b> is missing.<br><br>Required file: <em>${nodeInfo.filename}</em><br><br>Would you like to recover it?`;
    }
    
    const btnContainer = document.createElement("div");
    Object.assign(btnContainer.style, { display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" });

    // BUTTON: DOWNLOAD
    const btnDownload = document.createElement("button");
    btnDownload.textContent = localExists ? "Check & Overwrite from Library" : "Check Library (GitHub)";
    Object.assign(btnDownload.style, {
        padding: "8px 12px", cursor: "pointer", backgroundColor: "#2a6", 
        border: "none", color: "#fff", borderRadius: "4px", flex: "1"
    });

    // BUTTON: RECONSTRUCT
    const btnCreate = document.createElement("button");
    btnCreate.textContent = localExists ? "Overwrite with Placeholder" : "Create Placeholder";
    Object.assign(btnCreate.style, {
        padding: "8px 12px", cursor: "pointer", backgroundColor: "#d84", 
        border: "none", color: "#fff", borderRadius: "4px", flex: "1"
    });

    // BUTTON: CLOSE
    const btnClose = document.createElement("button");
    btnClose.textContent = "Ignore";
    Object.assign(btnClose.style, {
        padding: "8px 12px", cursor: "pointer", backgroundColor: "#444", 
        border: "none", color: "#fff", borderRadius: "4px"
    });
    btnClose.onclick = () => dialog.remove();

    // LOGIC
    btnDownload.onclick = async () => {
        btnDownload.textContent = "Checking...";
        btnDownload.disabled = true;
        
        try {
            const checkResp = await api.fetchApi("/imgnr/txt2combo/reconstruct_check", {
                method: "POST", body: JSON.stringify({ filename: nodeInfo.filename })
            });
            const checkData = await checkResp.json();
            
            if (checkData.exists) {
                btnDownload.textContent = "Downloading...";
                await performReconstruction("download", nodeInfo, dialog);
            } else {
                btnDownload.textContent = "Not Found in Library";
                btnDownload.style.backgroundColor = "#833";
                setTimeout(() => {
                     btnDownload.disabled = false;
                     btnDownload.textContent = localExists ? "Check & Overwrite from Library" : "Check Library (GitHub)";
                     btnDownload.style.backgroundColor = "#2a6";
                }, 2000);
            }
        } catch (e) {
            btnDownload.textContent = "Error";
            console.error(e);
        }
    };

    btnCreate.onclick = async () => {
        btnCreate.textContent = "Creating...";
        await performReconstruction("create", nodeInfo, dialog);
    };

    btnContainer.appendChild(btnDownload);
    btnContainer.appendChild(btnCreate);
    btnContainer.appendChild(btnClose);

    dialog.appendChild(h3);
    dialog.appendChild(p);
    dialog.appendChild(btnContainer);
    document.body.appendChild(dialog);
}

async function performReconstruction(action, nodeInfo, dialog) {
    try {
        const resp = await api.fetchApi("/imgnr/txt2combo/reconstruct_do", {
            method: "POST",
            body: JSON.stringify({
                action: action,
                filename: nodeInfo.filename,
                headers: nodeInfo.headers
            })
        });
        const result = await resp.json();
        
        if (result.success) {
            dialog.remove();
            alert(result.message + "\n\nPress OK to reload the page and activate the node.");
            
            // Force full page reload to ensure LiteGraph registers the new class correctly
            location.reload(); 
        } else {
            alert("Error: " + result.message);
        }
    } catch (e) {
        alert("API Error: " + e);
    }
}