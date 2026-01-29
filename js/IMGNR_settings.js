import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "IMGNR.Settings",
    setup() {
        const PREFIX = "IMGNR";

        // Helper to trigger live update
        const triggerRefresh = () => {
            if (window.IMGNR_REFRESH_SPLIT_SCREEN) {
                window.IMGNR_REFRESH_SPLIT_SCREEN();
            }
        };

        // =========================================================
        // HEADER 
        // =========================================================

        app.ui.settings.addSetting({
            id: `${PREFIX}.IMGNR.2`,
            name: "Howto / Suggestions / Issues:",
            type: (name, setter, value) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td colspan="2">
                        <div style="display: flex; justify-content: space-between; align-items: right; width: 100%;">
                            <a href="https://github.com/ImagineerNL/ComfyUI-IMGNR-Utils" target="_blank" style="color: #08B5A7; text-decoration: underline;">GitHub Repository</a>
                        </div>
                    </td>
                `;
                return tr;
            },
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.IMGNR.1`,
            name: "Included Nodes:",
            type: (name, setter, value) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td colspan="2">
                        <div style="display: flex; justify-content: space-between; align-items: start; width: 100%;text-align: right; color: #08B5A7;">
                            Catch and Edit Text<br>
                            Preview Image - No Save<br>
                            Txt2Combo Dynamic Nodes
                        </div>
                    </td>
                `;
                return tr;
            },
        });

        // =========================================================
        // SECTION: SPLIT SCREEN
        // =========================================================

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.EnableInteraction`,
            name: "Enable Right Pane Interaction",
            tooltip: "Enables interacting with the right pane, same as left pane (Experimental, needs re-opening SplitScreen)",
            type: "boolean",
            defaultValue: false,
            onChange: triggerRefresh
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.CloneBgColor`,
            name: "Right Pane Background (Hex)",
            tooltip: "Background Tint for the Right Pane (needs re-opening SplitScreen)",
            type: "text",
            defaultValue: "#141414",
            onChange: triggerRefresh
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.LabelColor`,
            name: "Bottom Label Color (Hex)",
            tooltip: "Bottom Label Color (needs re-opening SplitScreen)",
            type: "text",
            defaultValue: "#ceff00",
            onChange: triggerRefresh
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.LabelSize`,
            name: "Bottom Label Size (px)",
            type: "slider",
            attrs: { min: 8, max: 24, step: 1 },
            defaultValue: 10,
            onChange: triggerRefresh
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.RememberPosition`,
            name: "Remember Split Line Position",
            tooltip: "Restores the Split Line position after a browser reload.",
            type: "boolean",
            defaultValue: true,
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.LineColor`,
            name: "Split Line Color (Hex)",
            type: "text",
            defaultValue: "#08B5A7", 
            onChange: triggerRefresh
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.LineWidth`,
            name: "Split Line Width (px)",
            type: "slider",
            attrs: { min: 1, max: 20, step: 1 },
            defaultValue: 4,
            onChange: triggerRefresh
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.SplitScreen.Enabled`,
            name: "Enable Split Screen",
            tooltip: "Enables Split Screen functionality in Top Menu Bar. Note: can have impact on performance. Not compatible with Nodes2.0. (Requires Reload of page)",
            type: "boolean",
            defaultValue: true,
        });


        // =========================================================
        // SECTION: UMightHaveANodeForThat
        // =========================================================

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.DebugNodeName`,
            name: "Debug Match Node (Title or S&R Name)",
            tooltip: "If Debug is enabled, specifically log scoring details for nodes matching this text (e.g., 'LoadEmbedding'). Leave empty to just see top results.",
            type: "text",
            defaultValue: "",
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.DebugEnabled`,
            name: "Debug Logic to Console",
            tooltip: "Outputs detailed scoring info to the main console window.",
            type: "boolean",
            defaultValue: false,
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.MaxAlternatives`,
            name: "Max Suggestions",
            type: "slider",
            attrs: { min: 1, max: 50, step: 1 },
            defaultValue: 15,
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.MinScore`,
            name: "Minimum Match %",
            type: "slider",
            attrs: { min: 0, max: 100, step: 5 },
            defaultValue: 50,
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.StrictConnected`,
            name: "Match only to already Connected Input/Output Types",
            type: "boolean",
            defaultValue: false,
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.StrictMatch`,
            name: "Require ALL Input/Output Types to Match alternative",
            type: "boolean",
            defaultValue: false,
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.ScoringType`,
            name: "Scoring Display",
            type: "combo",
            options: ["Percentage", "Raw Score"],
            defaultValue: "Percentage",
        });

        app.ui.settings.addSetting({
            id: `${PREFIX}.UMHANFT.Enabled`,
            name: "Enable UMightHaveANodeForThat",
            tooltip: "Enables Rightclick contectmenu item UMightHaveANodeForThat on nodes to search for matching alternatives. Great when missing nodes in downloaded Workflows. (Requires Page Reload)",
            type: "boolean",
            defaultValue: true,
        });


        // =========================================================
        // SECTION: IMGNR ToSVG-Potracer
        // =========================================================

        app.ui.settings.addSetting({
            id: `${PREFIX}.You Might Also like`,
            name: "Image to smooth BW Vectors using Potracer with ToSVG-Potracer",
            type: (name, setter, value) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td colspan="2">
                        <div style="display: flex; justify-content: space-between; align-items: right; width: 100%;">
                            <a href="https://github.com/ImagineerNL/ComfyUI-ToSVG-Potracer" target="_blank" style="color: #08B5A7; text-decoration: underline;">ToSVG Potracer on GitHub.</a>
                        </div>
                    </td>
                `;
                return tr;
            },
        });

    }
});