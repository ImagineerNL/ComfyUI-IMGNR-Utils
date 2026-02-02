// IMGNR-Utils/DIY Reconstructor
// Detects missing dynamic nodes and offers to repair them.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "IMGNR.DIYReconstructor",

    async setup() {
        const originalLoadGraphData = app.loadGraphData;
        app.loadGraphData = function (graphData) {
            const result = originalLoadGraphData.apply(this, arguments);
            console.log("[DIY Nodes] Graph loaded. Queuing scan for missing nodes...");
            setTimeout(() => checkForMissingNodes(), 1000);
            return result;
        };
    }
});

async function checkForMissingNodes() {
    console.log("[DIY Nodes] Scanning graph for missing DIY nodes...");
    const missingNodes = [];
    let legacyTxt2ComboFound = false;

    if (!app.graph || !app.graph._nodes) {
        console.log("[DIY Nodes] Graph not ready.");
        return;
    }
    
    for (const node of app.graph._nodes) {
        // 1. Backwards Compatibility Check (Txt2Combo)
        if (node.type.startsWith("Txt2Combo_")) {
            const nodeDef = LiteGraph.registered_node_types[node.type];
            if (!nodeDef) {
                legacyTxt2ComboFound = true;
            }
            continue; // Skip further processing for legacy nodes
        }

        // 2. Standard DIY Check
        if (node.type.startsWith("DIY_")) {
            const nodeDef = LiteGraph.registered_node_types[node.type];
            
            if (!nodeDef) {
                console.log(`[DIY Nodes] Found missing node: ${node.type}`);
                
                let rawName = node.type.replace("DIY_", "");
                // Replace the last _txt with .txt if present
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

    // Popup for Legacy Nodes
    if (legacyTxt2ComboFound) {
        showLegacyDialog();
    }

    // Prompt for DIY Nodes
    if (missingNodes.length > 0) {
        console.log(`[DIY Nodes] Prompting recovery for ${missingNodes.length} nodes.`);
        const target = missingNodes[0]; 
        showRecoveryDialog(target);
    } else {
        console.log("[DIY Nodes] No missing DIY nodes found.");
    }
}

function showLegacyDialog() {
    const dialog = document.createElement("dialog");
    Object.assign(dialog.style, {
        border: "1px solid #555", backgroundColor: "#222", color: "#ddd",
        padding: "20px", borderRadius: "8px", position: "fixed", 
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 10000, display: "flex", flexDirection: "column", gap: "10px",
        fontFamily: "Arial, sans-serif", maxWidth: "500px", boxShadow: "0 0 20px #000"
    });

    const h3 = document.createElement("h3");
    h3.textContent = "IMGNR Txt2Combo Legacy Nodes Detected";
    h3.style.margin = "0 0 5px 0";
    h3.style.color = "#ffcc00";

    const p = document.createElement("p");
    p.style.lineHeight = "1.5";
    p.innerHTML = "Txt2Combo nodes are now <b>DIY Nodes</b>.<br><br>Definitions have been moved to:<br><b>\\user\\IMGNR_Utils\\DIY-nodes</b><br><br>Please update your workflow.";

    const btnContainer = document.createElement("div");
    Object.assign(btnContainer.style, { display: "flex", gap: "10px", marginTop: "15px", justifyContent: "center" });

    const btnOk = document.createElement("button");
    btnOk.textContent = "OK";
    Object.assign(btnOk.style, {
        padding: "8px 12px", cursor: "pointer", backgroundColor: "#2a6", 
        border: "none", color: "#fff", borderRadius: "4px", minWidth: "80px"
    });
    btnOk.onclick = () => dialog.remove();

    btnContainer.appendChild(btnOk);
    dialog.appendChild(h3);
    dialog.appendChild(p);
    dialog.appendChild(btnContainer);
    document.body.appendChild(dialog);
}

async function showRecoveryDialog(nodeInfo) {
    // 1. Check if file exists locally (User Folder or Lib Folder)
    // The backend now checks for variations (Spaces vs Underscores)
    let existsUser = false;
    let existsLib = false;
    let userPath = "";
    let correctFilename = nodeInfo.filename; // Default
    
    try {
        const resp = await api.fetchApi("/imgnr/diy/check_local_file", {
            method: "POST", body: JSON.stringify({ filename: nodeInfo.filename })
        });
        const data = await resp.json();
        existsUser = data.exists_user;
        existsLib = data.exists_lib;
        userPath = data.user_path;
        correctFilename = data.filename; // Use the actual file found (e.g. "My File.txt")
    } catch(e) { console.error("Local check failed", e); }

    // Update info with correct filename for subsequent actions
    const currentInfo = { ...nodeInfo, filename: correctFilename };

    const dialog = document.createElement("dialog");
    Object.assign(dialog.style, {
        border: "1px solid #555", backgroundColor: "#222", color: "#ddd",
        padding: "20px", borderRadius: "8px", position: "fixed", 
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 10000, display: "flex", flexDirection: "column", gap: "10px",
        fontFamily: "Arial, sans-serif", maxWidth: "500px", boxShadow: "0 0 20px #000"
    });

    const h3 = document.createElement("h3");
    h3.textContent = "Missing DIY Node";
    h3.style.margin = "0 0 5px 0";
    
    if (existsUser) h3.style.color = "#ffcc00"; 
    else if (existsLib) h3.style.color = "#44ff44"; 
    else h3.style.color = "#ff6666"; 
    
    const p = document.createElement("p");
    p.style.lineHeight = "1.5";
    
    const btnContainer = document.createElement("div");
    Object.assign(btnContainer.style, { display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" });

    // --- SCENARIO 1: File Exists in User Folder ---
    if (existsUser) {
        p.innerHTML = `Node definition file <b>'${currentInfo.filename}'</b> exists in <b>'${userPath}'</b> but cannot be loaded.<br><br>
        1. <b>Restart ComfyUI</b> to try loading it again.<br>
        2. If this message recurs, the definition might be corrupted.<br><br>
        Select an option below to <b>OVERWRITE</b> the existing file:`;
        
        createButton("Check & Overwrite from Library", "#2a6", () => checkGitHubAndDownload(currentInfo, dialog));
        createButton("Overwrite with Placeholder", "#d84", () => performReconstruction("create", currentInfo, dialog));
        createButton("Ignore", "#444", () => dialog.remove());
    } 
    // --- SCENARIO 2: Found in Local Library ---
    else if (existsLib) {
        p.innerHTML = `The node <b>${currentInfo.type}</b> is missing.<br><br>
        However, the definition file <b>'${currentInfo.filename}'</b> was found in your installed DIY-node-library.<br><br>
        Would you like to restore it?`;

        createButton("Restore from Local Library", "#2a6", () => performReconstruction("restore_local", currentInfo, dialog));
        createButton("Ignore", "#444", () => dialog.remove());
    }
    // --- SCENARIO 3: Totally Missing ---
    else {
        p.innerHTML = `The node <b>${currentInfo.type}</b> is missing.<br><br>
        Required file: <em>${currentInfo.filename}</em> (or variant)<br><br>
        It is not in your library. Would you like to check GitHub?`;

        createButton("Check Library (GitHub)", "#2a6", () => checkGitHubAndDownload(currentInfo, dialog));
        createButton("Create Placeholder", "#d84", () => performReconstruction("create", currentInfo, dialog));
        createButton("Ignore", "#444", () => dialog.remove());
    }

    function createButton(text, color, onClick) {
        const btn = document.createElement("button");
        btn.textContent = text;
        Object.assign(btn.style, {
            padding: "8px 12px", cursor: "pointer", backgroundColor: color, 
            border: "none", color: "#fff", borderRadius: "4px", flex: "1"
        });
        btn.onclick = onClick;
        btnContainer.appendChild(btn);
    }

    dialog.appendChild(h3);
    dialog.appendChild(p);
    dialog.appendChild(btnContainer);
    document.body.appendChild(dialog);
}

// Logic wrapper for GitHub check
async function checkGitHubAndDownload(nodeInfo, dialog) {
    const btns = dialog.querySelectorAll("button");
    btns.forEach(b => b.textContent = "Checking...");

    try {
        const checkResp = await api.fetchApi("/imgnr/diy/reconstruct_check", {
            method: "POST", body: JSON.stringify({ filename: nodeInfo.filename })
        });
        const checkData = await checkResp.json();
        
        if (checkData.exists) {
            // Update filename if GitHub found a variant (e.g. Space vs Underscore)
            if (checkData.found_name) nodeInfo.filename = checkData.found_name;
            
            btns.forEach(b => b.textContent = "Downloading...");
            await performReconstruction("download", nodeInfo, dialog);
        } else {
            alert("File not found in GitHub Library.");
            dialog.remove();
        }
    } catch (e) {
        alert("Error checking GitHub: " + e);
    }
}

async function performReconstruction(action, nodeInfo, dialog) {
    try {
        const resp = await api.fetchApi("/imgnr/diy/reconstruct_do", {
            method: "POST",
            body: JSON.stringify({
                action: action,
                filename: nodeInfo.filename,
                headers: nodeInfo.headers
            })
        });
        const result = await resp.json();
        
        if (result.success) {
            // UPDATE EXISTING POPUP (Smoother UX)
            
            // 1. Get Elements
            const h3 = dialog.querySelector("h3");
            const p = dialog.querySelector("p");
            const btnContainer = dialog.querySelector("div");

            // 2. Update Header
            if(h3) {
                h3.textContent = "Node Restored";
                h3.style.color = "#44ff44"; // Success Green
            }

            // 3. Update Message (Add bolding for clarity)
            if(p) {
                p.innerHTML = result.message.replace(
                    "ComfyUI server needs to be restarted", 
                    "<b>ComfyUI server needs to be restarted</b>"
                );
            }

            // 4. Update Buttons (Replace all with single OK)
            if(btnContainer) {
                btnContainer.innerHTML = ""; // Clear existing
                
                const btnOk = document.createElement("button");
                btnOk.textContent = "OK";
                Object.assign(btnOk.style, {
                    padding: "8px 12px", cursor: "pointer", backgroundColor: "#2a6", 
                    border: "none", color: "#fff", borderRadius: "4px", width: "100%" 
                });
                btnOk.onclick = () => dialog.remove();
                btnContainer.appendChild(btnOk);
            }

        } else {
            alert("Error: " + result.message);
        }
    } catch (e) {
        alert("API Error: " + e);
    }
}