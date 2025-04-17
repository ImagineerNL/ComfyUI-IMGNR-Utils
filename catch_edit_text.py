# IMGNR UtilityPack/CatchEditText
# Version: 1.0 - First Publication
# 1.0.1 - streamlined for nodepack

class CatchEditTextNode:
    """
    Catches text input, displays it in an editable widget.
    'Use Input': Outputs input, attempts to update widget display.
    'Use Edit & Mute Input': Outputs widget text, mutes upstream node providing input.
    Input is optional to allow upstream muting without validation errors.
    """

    @classmethod
    def INPUT_TYPES(cls):
        widget_default_text = (
            "Catches and shows text being created by a previous node\n"
            "Enables editing the text for subsequent runs\n"
            "Very useful for tweaking (AI) generated prompts\n"
            "Using the edited text also mutes the input node, saving processing time and possibly budget on rated calls.\n"
            "\n"
            "NOTE: ONLY connect to the 'INPUT_TEXT' below; connecting to this textbox turns this node effectively into a a/b switch instead of an editor.\n"
            "\n"
            "Output is controlled by 'action' below.\n"
            "- Use Input: Outputs the connected text, updates this view.\n"
            "- Use Edit & Mute Input: Outputs the (edited) text from current node, mutes input node."
        )
        return {
            "required": {
                "editable_text_widget": ("STRING", {
                    "multiline": True,
                    "default": widget_default_text
                }),
                "action": (
                    ["use_input", "use_edit_mute_input"],
                    {"default": "use_input"}
                )
            },
            "optional": {
                 "input_text": ("STRING", {"default": ""})
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "process_text"
    CATEGORY = "IMGNR/Utils"
    OUTPUT_NODE = True

    # --- Helper functions ---
    def find_node_by_id(self, unique_id, workflow_info):
        if not workflow_info or "nodes" not in workflow_info: print(f"[{self.__class__.__name__}] Helper Error: Invalid workflow_info."); return None 
        target_id = str(unique_id[0]) if isinstance(unique_id, list) else str(unique_id)
        for node_data in workflow_info["nodes"]:
            if str(node_data.get("id")) == target_id: return node_data
        print(f"[{self.__class__.__name__}] Helper Error: Node ID {target_id} not found in workflow."); return None 

    def find_widget_index(self, node_data, widget_name):
        req_keys = list(self.INPUT_TYPES().get("required", {}).keys())
        opt_keys = list(self.INPUT_TYPES().get("optional", {}).keys())
        all_keys = req_keys + opt_keys
        try:
            idx = all_keys.index(widget_name)
            # print(f"[{self.__class__.__name__}] Found widget '{widget_name}' at combined index {idx}.") # Optional log
            return idx
        except ValueError:
            print(f"[{self.__class__.__name__}] Helper Error: Widget '{widget_name}' not found in INPUT_TYPES keys: {all_keys}") 
            return None

    # --- Main Processing Function ---
    def process_text(self, editable_text_widget: str, action: str, unique_id=None, extra_pnginfo=None, input_text: str = None):
        output_text = ""
        text_for_widget_update = None
        class_name_log = self.__class__.__name__ # For logging

        # Use default if input is None
        effective_input_text = input_text if input_text is not None else self.INPUT_TYPES()['optional']['input_text'][1].get('default', '')

        print(f"[{class_name_log}] Action: '{action}', Node ID: {unique_id}")

        if action == "use_input":
            output_text = effective_input_text
            text_for_widget_update = output_text
            print(f"[{class_name_log}] Chose 'use_input'. Outputting received/default input ('{output_text[:60]}...'). Attempting UI widget update.")
            if input_text is None:
                 print(f"[{class_name_log}] Info: 'use_input' selected, using default (input disconnected?).")
            elif input_text == self.INPUT_TYPES()['optional']['input_text'][1].get('default', ''):
                 print(f"[{class_name_log}] Info: 'use_input' selected, using default input value (upstream muted?).")

        elif action == "use_edit_mute_input":
            output_text = editable_text_widget
            print(f"[{class_name_log}] Chose 'use_edit_mute_input'. Outputting widget text ('{output_text[:60]}...').")
        else:
             print(f"[{class_name_log}] Warning: Unknown action '{action}'. Defaulting to outputting widget text.")
             output_text = editable_text_widget

        # --- Attempt to update the UI widget ---
        node_data_updated = False
        if text_for_widget_update is not None and unique_id and extra_pnginfo:
            print(f"[{class_name_log}] Attempting UI widget update for node {unique_id[0]}...") 
            current_workflow_info = extra_pnginfo[0] if isinstance(extra_pnginfo, list) and extra_pnginfo else extra_pnginfo
            if current_workflow_info and isinstance(current_workflow_info, dict) and "workflow" in current_workflow_info:
                node_data = self.find_node_by_id(unique_id, current_workflow_info["workflow"])
                if node_data:
                    widget_index = self.find_widget_index(node_data, "editable_text_widget")
                    if widget_index is not None:
                        if "widgets_values" not in node_data or not isinstance(node_data["widgets_values"], list):
                            req_widgets = len(self.INPUT_TYPES().get("required", {}))
                            opt_widgets = len(self.INPUT_TYPES().get("optional", {}))
                            num_widgets = req_widgets + opt_widgets
                            node_data["widgets_values"] = ["" for _ in range(num_widgets)]; print(f"[{class_name_log}] Initialized/Reset widgets_values.") 
                        while len(node_data["widgets_values"]) <= widget_index: node_data["widgets_values"].append(""); print(f"[{class_name_log}] Padded widgets_values.") 
                        current_widget_val = node_data["widgets_values"][widget_index]
                        if current_widget_val != text_for_widget_update:
                            node_data["widgets_values"][widget_index] = text_for_widget_update; print(f"[{class_name_log}] ---> Set widgets_values[{widget_index}]."); node_data_updated = True 
                        else: print(f"[{class_name_log}] Widget value already matches target.") 
            elif text_for_widget_update is not None: print(f"[{class_name_log}] Cannot attempt UI update - missing unique_id or extra_pnginfo.") 

        text_to_show_in_ui = text_for_widget_update if text_for_widget_update is not None else editable_text_widget
        print(f"[{class_name_log}] Final Output Text Type: {type(output_text)}, Value: '{str(output_text)[:60]}...'") 

        return_dict = {"ui": {"text": [str(text_to_show_in_ui)]}, "result": (str(output_text),)}
        return return_dict

# === ComfyUI Registration ===

NODE_CLASS_MAPPINGS = {
    "CatchEditTextNode": CatchEditTextNode
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CatchEditTextNode": "Catch and Edit Text (IMGNR)"
}