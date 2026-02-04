# IMGNR-Utils/CatchEditText
# Version: Status Color + Toggle + Tooltips
# Support Soft + Hard Mute

import concurrent.futures
from . import IMGNR_constants as C


class CatchEditTextNode:
    DESCRIPTION = """
    Catches text from input and displays it the textbox.
    Allows you to pause/block the upstream node and edit
    the text manually for subsequent runs.
    Ideal for saving on unneeded resources or api calls 
    to tweak LLM Output prompts.
    
    Modes:
    - Use Input: Passes the connected input to output. 
    Updates the textbox with the input.
    - Use_edit_mute_input: Ignores the input signal. 
    Outputs the text currently in the textbox.
    - Use_edit_BLOCK_inputnode: Actively prevents the 
    previous node from executing. Uses the widget text.

    Use statuscolor toggle to show mode on node header.
    """

    @classmethod
    def INPUT_TYPES(cls):
        widget_default_text = (
            "Catches and shows any text being created by a previous node\n"
            "Enables editing the text for subsequent runs.\n"
            "Mute: mutes connected input node.\n"
            "If inputnode is forced to run,\n"
            "(e.g. randomize seed or other connected output to that node),\n"
            "the input node still runs but the catcher ignores it.\n"
            "Block: actively prevents previous node from running.\n"
            "Use statuscolor toggle to show mode on node header."
        )
        return {
            "required": {
                "editable_text_widget": ("STRING", {
                    "multiline": True,
                    "default": widget_default_text,
                    #"tooltip": ""
                }),
                "action": (
                    ["use_input", "use_edit_mute_input", "use_edit_block_inputnode"],
                    {
                        "default": "use_input",
                        "tooltip": "Mode Selector"
                    }
                ),
                "use_status_color": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Color Titlebar"
                }),
            },
            "optional": {
                 "input_text": ("STRING", {
                     "default": "", 
                     "forceInput": True,
                     "tooltip": "Connect here"
                 })
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "",
            },
        }

    RETURN_TYPES = ("STRING",)
    OUTPUT_TOOLTIPS = ("",)
    
    FUNCTION = "process_text"
    CATEGORY = "IMGNR"
    OUTPUT_NODE = True
    
    INPUT_IS_LIST = True

    # --------------------------------------------------------------
    # LAZY STATUS (Soft Mute)
    # Hard Mute is in js
    # --------------------------------------------------------------
    def check_lazy_status(self, action, **kwargs):
        val = action[0] if isinstance(action, list) else action
        if val == "use_input":
            return ["input_text"]
        return []

    # --- Helper functions ---
    def find_node_by_id(self, unique_id, workflow_info):
        if not workflow_info or "nodes" not in workflow_info: return None 
        target_id = str(unique_id[0]) if isinstance(unique_id, list) else str(unique_id)
        for node_data in workflow_info["nodes"]:
            if str(node_data.get("id")) == target_id: return node_data
        return None 

    def find_widget_index(self, node_data, widget_name):
        req_keys = list(self.INPUT_TYPES().get("required", {}).keys())
        opt_keys = list(self.INPUT_TYPES().get("optional", {}).keys())
        all_keys = req_keys + opt_keys
        try:
            return all_keys.index(widget_name)
        except ValueError:
            return None

    # --- Main Processing Function ---
    def process_text(self, editable_text_widget, action, use_status_color, unique_id=None, extra_pnginfo=None, input_text=None):
        # Safe fallback: get current widget text immediately
        curr_widget_text = editable_text_widget[0] if isinstance(editable_text_widget, list) else editable_text_widget

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                # Submit the core logic to the thread pool
                future = executor.submit(
                    self._process_text_core, 
                    editable_text_widget, 
                    action, 
                    use_status_color, 
                    unique_id, 
                    extra_pnginfo, 
                    input_text
                )
                # Wait for result with a 10s timeout
                return future.result(timeout=10)
        except concurrent.futures.TimeoutError:
            print(f"{C.WARN_PREFIX} [CatchEditTextNode] Execution timed out (10s). Gracefully returning current widget text.")
            return {"ui": {"text": [str(curr_widget_text)]}, "result": (str(curr_widget_text),)}

    def _process_text_core(self, editable_text_widget, action, use_status_color, unique_id=None, extra_pnginfo=None, input_text=None):
        
        curr_action = action[0] if isinstance(action, list) else action
        curr_widget_text = editable_text_widget[0] if isinstance(editable_text_widget, list) else editable_text_widget
        
        effective_input_text = ""
        if input_text is not None:
             effective_input_text = input_text[0] if isinstance(input_text, list) else input_text

        class_name_log = "[CatchEditTextNode]"
        output_text = ""
        text_for_widget_update = None

        if curr_action == "use_input":
            output_text = effective_input_text
            text_for_widget_update = output_text
            print(f"{C.LOG_PREFIX} {class_name_log} Mode: Input.")
        
        else:
            output_text = curr_widget_text
            print(f"{C.LOG_PREFIX} {class_name_log} Mode: Edit ({curr_action}).")

        # --- UI Update Logic ---
        if text_for_widget_update is not None and unique_id and extra_pnginfo:
            current_workflow_info = extra_pnginfo[0] if isinstance(extra_pnginfo, list) and extra_pnginfo else extra_pnginfo
            if current_workflow_info and isinstance(current_workflow_info, dict) and "workflow" in current_workflow_info:
                node_data = self.find_node_by_id(unique_id, current_workflow_info["workflow"])
                if node_data:
                    widget_index = self.find_widget_index(node_data, "editable_text_widget")
                    if widget_index is not None:
                        if "widgets_values" not in node_data: node_data["widgets_values"] = ["", ""]
                        while len(node_data["widgets_values"]) <= widget_index: node_data["widgets_values"].append("")
                        if node_data["widgets_values"][widget_index] != text_for_widget_update:
                            node_data["widgets_values"][widget_index] = text_for_widget_update

        text_to_show_in_ui = text_for_widget_update if text_for_widget_update is not None else curr_widget_text
        
        return {"ui": {"text": [str(text_to_show_in_ui)]}, "result": (str(output_text),)}

# --- REGISTER NODES ---

NODE_CLASS_MAPPINGS = { "CatchEditTextNode": CatchEditTextNode }
NODE_DISPLAY_NAME_MAPPINGS = { "CatchEditTextNode": "Catch and Edit Text (IMGNR)" }