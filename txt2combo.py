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
create_file_if_missing("cameras.txt", ["[Cameras]", "Canon", "Nikon", "Sony", "[Lens]", "Telephoto", "Portrait", "Wide-Angle", "70mm Prime"] )


# --- WRITER NODE ---

class Txt2ComboWriter:
    DESCRIPTION = """
    Manage text lists for Txt2Combo nodes.
    Txt2Combo nodes are created on Server (Re)Start
    ComboList files are stored in User/IMGNR-Utils/Txt2Combo
    Updated nodes during runtime need to be refreshed 
    by pressing 'R' on the specific node

    - Populate: Reads an existing file into the Text box.
    - Append: Adds new items to the end of the selected file.
    - Overwrite: Replaces the file content, cannot be undone!

    Connect the 'inspect' output to almost any existing 
    combobox to populate text box with values.
    Very handy to filter longer combos to just the combos you need. 
    'inspect' functionality is heavily inspired on the wonderful 
    Outputlist-combiner by GeroldMeisinger

    Multi-Combo Support:
    You can create multiple dropdowns in a single node by using brackets `[]`.
    Note: Adding new files or `[Sections]` requires a Server Restart to update the node's output slots. 
    Editing items inside existing sections only requires a Refresh (R).
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
                    "tooltip": "Name of new Txt2Combo Node"
                }),
                "mode": (["overwrite", "append", "populate"], {
                    "default": "populate",
                    "tooltip": "Populate: Read file. Append: Add to file. Overwrite: Replace!! file"
                }),
                "content": ("STRING", {
                    "default": "", 
                    "multiline": True, 
                    "dynamicPrompts": False,
                    "tooltip": "List items. Use [Section Name] to create multiple combos."
                }),
            },
            "hidden": {
                "prompt": "PROMPT", 
                "extra_pnginfo": ""
            },
        }

    RETURN_TYPES = ("STRING", "STRING", ANY)
    RETURN_NAMES = ("dbg_status", "dbg_output", "inspect")
    
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
    FUNCTION = "select_text"
    CATEGORY = "IMGNR/Utils"

    # The logic is handled dynamically below, but we need a base execute
    def select_text(self, **kwargs):
        # Return values in the order of the keys (which matches output order)
        return tuple(kwargs.values())

def parse_file_sections(file_path):
    """
    Parses a file into a dictionary of sections.
    Format:
    [Section1]
    item1
    item2
    [Section2]
    item3
    """
    sections = {}
    current_section = "text" # Default input name if no brackets found
    
    # Initialize default section
    sections[current_section] = []

    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
            
            for line in lines:
                if line.startswith("[") and line.endswith("]"):
                    # New Section Found
                    current_section = line[1:-1] # Remove brackets
                    if current_section not in sections:
                        sections[current_section] = []
                else:
                    sections[current_section].append(line)
        except Exception:
            sections["Error"] = ["Error reading file"]
    else:
        sections["Error"] = ["File Missing"]

    # Clean up: If we found sections, remove the default if it's empty
    if len(sections) > 1 and not sections["text"]:
        del sections["text"]
        
    return sections

def create_dynamic_node(filename_with_ext):
    file_path = os.path.join(target_dir, filename_with_ext)
    
    # 1. Parse File to get Structure
    # We do this at Import time to define Return Names
    sections = parse_file_sections(file_path)
    section_keys = list(sections.keys())

    # 2. Define the INPUT_TYPES method dynamically
    def input_types_method(cls):
        # Re-parse on input check (Allows "Refresh" to update values)
        # Note: "Refresh" cannot update keys (Outputs) without restart
        current_sections = parse_file_sections(file_path)
        
        inputs = {"required": {}}
        for key in section_keys:
            # Fallback if key missing in new file version
            options = current_sections.get(key, ["missing_section"]) 
            if not options: options = ["empty"]
            
            inputs["required"][key] = (options, {"default": options[0]})
            
        return inputs

    safe_name = filename_with_ext.replace(".", "_").replace(" ", "_")
    internal_class_name = f"Txt2Combo_{safe_name}"

    # 3. Create the Class
    DynamicClass = type(
        internal_class_name,
        (Txt2ComboBase,), 
        {
            "INPUT_TYPES": classmethod(input_types_method),
            # Create ANY output for every section found
            "RETURN_TYPES": (ANY,) * len(section_keys),
            "RETURN_NAMES": tuple(section_keys),
            "OUTPUT_TOOLTIPS": tuple([f"Output for {k}" for k in section_keys])
        }
    )

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