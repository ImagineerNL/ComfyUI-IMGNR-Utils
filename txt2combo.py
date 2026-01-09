# IMGNR-Utils/Txt2Combo.py
# Initial code
# Due to heavy inspiration of code in the String Outputlist node by https://github.com/geroldmeisinger/ComfyUI-outputlists-combiner,
# the Txt2Combo Node and code is node is licensed under the GPL-3.0 license 

import os
import folder_paths

# --- SETUP PATHS ---
comfy_user_dir = folder_paths.get_user_directory()
target_dir = os.path.join(comfy_user_dir, "IMGNR_Utils", "txt2combo")

if not os.path.exists(target_dir):
    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        print(f"[Txt2Combo] Error creating directory: {e}")

# --- UTILITY: THE "ALWAYS VALID" WILDCARD ---
class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

ANY = AnyType("*")


# --- HELPER: CREATE DEFAULTS ---
def create_file_if_missing(filename, content_list):
    file_path = os.path.join(target_dir, filename)
    if not os.path.exists(file_path):
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(content_list))
        except Exception as e:
            print(f"[Txt2Combo] Error creating {filename}: {e}")

create_file_if_missing("example.txt", ["example 1", "example 2", "example 3", "Values stored in User>IMGNR-Utils>Txt2Combo"])
create_file_if_missing("cameras.txt", ["Canon", "Nikon", "Sony"])


# --- WRITER NODE ---

class Txt2ComboWriter:
    DESCRIPTION = """
    Manage text lists for Txt2Combo nodes.
    Txt2Combo nodes are created on Server (Re)Start
    ComboList files are stored in User/IMGNR-Utils/Txt2Combo
    Updated nodes during runtime need to be refreshed by pressing 'R' on the specific node

    - Populate: Reads an existing file into the Text box.
    - Append: Adds new items to the end of the selected file.
    - Overwrite* Replaces the file content entirely, cannot be undone!

    - Connect the 'inspect' output to almost any existing combobox to populate text box with values.
    Very handy to filter longer combos to just the combos you need. 
    * 'inspect' functionality is heavily inspired on the wonderful [String Outputlist by GeroldMeisinger](https://github.com/geroldmeisinger/ComfyUI-outputlists-combiner)
    """

    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        existing_files = ["Create New > Use Filename Below"]
        if os.path.exists(target_dir):
            found_files = [f for f in os.listdir(target_dir) if f.endswith('.txt')]
            existing_files.extend(found_files)

        return {
            "required": {
                "select_file": (existing_files, {
                    "default": existing_files[0],
                    "tooltip": ""
                }),
                "filename": ("STRING", {
                    "default": "my_new_list", 
                    "multiline": False,
                    "tooltip": "Name for the new file. Also Name of new Txt2Combo Node"
                }),
                "mode": (["overwrite", "append", "populate"], {
                    "default": "populate",
                    "tooltip": "Populate: Read file. Append: Add to file. Overwrite: Replace!! file"
                }),
                "content": ("STRING", {
                    "default": "", 
                    "multiline": True, 
                    "dynamicPrompts": False,
                    "tooltip": "1 value per line"
                }),
            },
            "hidden": {
                "prompt": "PROMPT", 
                "extra_pnginfo": ""
            },
        }

    RETURN_TYPES = ("STRING", "STRING", ANY)
    RETURN_NAMES = ("dbg_status", "dbg_output", "inspect")
    
    # NEW: Tooltips for Outputs
    OUTPUT_TOOLTIPS = (
        "debug info",
        "debug info",
        "Connect to any Dropdown/Combo on any node to auto-populate, then auto-disconnects"
    )

    FUNCTION = "process_file"
    CATEGORY = "IMGNR/Utils"
    OUTPUT_NODE = True

    def process_file(self, select_file, filename, content, mode, prompt=None, extra_pnginfo=None):
        
        # Determine Filename
        if select_file != "Create New > Use Filename Below":
            final_filename = select_file
        else:
            final_filename = filename.strip()
            if not final_filename.lower().endswith(".txt"):
                final_filename += ".txt"

        full_path = os.path.join(target_dir, final_filename)
        
        # --- MODE: POPULATE ---
        if mode == "populate":
            if os.path.exists(full_path):
                try:
                    with open(full_path, "r", encoding="utf-8") as f:
                        file_content = f.read()
                    status = f"Success: Populated from {final_filename}"
                    print(f"[Txt2ComboWriter] {status}")
                    return {
                        "ui": { "text": [file_content] },
                        "result": (status, file_content, "*")
                    }
                except Exception as e:
                    return {"ui": {"text": [""]}, "result": (f"Error: {e}", "", "*")}
            else:
                return {"ui": {"text": [""]}, "result": (f"File not found: {final_filename}", "", "*")}

        # --- MODE: WRITE / APPEND ---
        new_lines = [line.strip() for line in content.splitlines() if line.strip()]
        text_to_write = "\n".join(new_lines)

        try:
            if mode == "append":
                if os.path.exists(full_path):
                    with open(full_path, "r", encoding="utf-8") as f:
                        old_content = f.read()
                    prefix = "\n" if old_content and not old_content.endswith("\n") else ""
                    
                    with open(full_path, "a", encoding="utf-8") as f:
                        f.write(prefix + text_to_write)
                    action = "Appended to"
                else:
                    with open(full_path, "w", encoding="utf-8") as f:
                        f.write(text_to_write)
                    action = "Created"
            else: # overwrite
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(text_to_write)
                action = "Overwrote"

            status_msg = f"Success: {action} {final_filename}."
            print(f"[Txt2ComboWriter] {status_msg}")

            return {
                "ui": { "text": [] },
                "result": (status_msg, text_to_write, "*")
            }

        except Exception as e:
            return {"ui": {"text": []}, "result": (f"Error: {e}", "", "*")}


# --- DYNAMIC READER NODES ---

class Txt2ComboBase:
    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("text",)
    OUTPUT_TOOLTIPS = ("The selected text string.",)
    
    FUNCTION = "select_text"
    CATEGORY = "IMGNR/Utils"

    def select_text(self, selected_value):
        return (selected_value,)

def create_dynamic_node(filename_with_ext):
    def input_types_method(cls):
        file_path = os.path.join(target_dir, filename_with_ext)
        options = ["File Missing"]
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    options = [line.strip() for line in f if line.strip()] or ["File is empty"]
            except:
                options = ["Error reading file"]
        
        return {"required": {"selected_value": (options, {"default": options[0]})}}

    safe_name = filename_with_ext.replace(".", "_").replace(" ", "_")
    internal_class_name = f"Txt2Combo_{safe_name}"

    DynamicClass = type(internal_class_name, (Txt2ComboBase,), {"INPUT_TYPES": classmethod(input_types_method)})
    return DynamicClass, internal_class_name


# --- REGISTER NODES ---

NODE_CLASS_MAPPINGS = {"Txt2ComboWriter": Txt2ComboWriter}
NODE_DISPLAY_NAME_MAPPINGS = {"Txt2ComboWriter": "Txt2Combo Writer (IMGNR)"}

if os.path.exists(target_dir):
    files = [f for f in os.listdir(target_dir) if f.endswith('.txt')]
    for filename in files:
        NodeClass, internal_name = create_dynamic_node(filename)
        clean_name = os.path.splitext(filename)[0]
        NODE_CLASS_MAPPINGS[internal_name] = NodeClass
        NODE_DISPLAY_NAME_MAPPINGS[internal_name] = f"Txt2Combo: {clean_name} (IMGNR)"