# IMGNR-Utils/Txt2Combo.py
# # Due to heavy inspiration of code in the String Outputlist node by https://github.com/geroldmeisinger/ComfyUI-outputlists-combiner,
# the Txt2Combo Node and code is node is licensed under the GPL-3.0 license 
# New: Multiple combos per node
# New: Extended with Lookup Table functionality & Security Fixes & Save Button

import os
import folder_paths
import re
import json
from server import PromptServer
from aiohttp import web

# --- SETUP PATHS ---
comfy_user_dir = folder_paths.get_user_directory()
target_dir = os.path.join(comfy_user_dir, "IMGNR_Utils", "txt2combo")

if not os.path.exists(target_dir):
    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        print(f"[Txt2Combo] Error creating directory: {e}")

# --- GLOBAL REGISTRY FOR API SECURITY ---
CLASS_TO_FILE_MAP = {}

# --- UTILITY: THE "ALWAYS VALID" WILDCARD ---
class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

ANY = AnyType("*")

# --- HELPER: TYPE CONVERSION ---
def parse_type_def(header_part):
    clean_part = header_part.strip()
    col_name = clean_part
    col_type = "STRING"
    default_val = ""

    if "=" in clean_part:
        name_str, type_str = clean_part.split("=", 1)
        col_name = name_str.strip()
        type_str = type_str.strip().lower()

        if type_str == "int":
            col_type = "INT"
            default_val = 0
        elif type_str == "float":
            col_type = "FLOAT"
            default_val = 0.0
        elif type_str == "bool":
            col_type = "BOOLEAN"
            default_val = False

    return col_name, col_type, default_val

def convert_value(value_str, target_type):
    value_str = value_str.strip()
    if target_type == "INT":
        try:
            clean = value_str.replace(",", "").replace(".", "")
            return int(float(value_str.replace(",", "."))) 
        except:
            try: return int(float(clean_val_float(value_str)))
            except: return 0
    elif target_type == "FLOAT":
        try: return float(clean_val_float(value_str))
        except: return 0.0
    elif target_type == "BOOLEAN":
        val = value_str.lower()
        if val in ["true", "1", "yes", "on"]: return True
        return False
    return value_str

def clean_val_float(val):
    val = val.replace(",", ".")
    if val.count(".") > 1:
        parts = val.split(".")
        whole = "".join(parts[:-1])
        decimal = parts[-1]
        return f"{whole}.{decimal}"
    return val

# --- HELPER: FILE DEFAULTS ---
def create_or_update_example(filename, content_list):
    file_path = os.path.join(target_dir, filename)
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(content_list))
    except Exception as e:
        print(f"[Txt2Combo] Error writing example file {filename}: {e}")

create_or_update_example("example.txt", [
    "# Example node!! Will reset on launch!!",
    "# Scroll down below list for more information",
    "[Resolution]; [Width=int]; [Height=int]; [Ratio=float]",
    "FullHD; 1920; 1080; 1.7778",
    "4K; 3840; 2160; 1.7778",
    "Square1080; 1080; 1080; 1.0",
    "",
    "[Format]",
    "PNG",
    "JPG",
    "[Boolean=bool]",
    "true",
    "false",
    "[Prefered Samplers]; [sampler]; [scheduler]",
    "EulerSimple; euler; simple",
    "EulerBeta; euler; beta",
    "dpmpp_2m; dpmpp_2m; karras",
    "lcm; lcm; normal",
    "# ",
    "# USAGE:",    
    "# Files are stored in User>IMGNR-Utils>Txt2Combo",
    "# Example Table: [Name=string]; [Width=int]; [Ratio=float]",
    "# Default is String, Filename is Txt2Combo node name",
    "# - First column is used for the dropdown.",
    "# - Use ; to separate columns. Use [Section] for new sections in node",
    "# - All columns become outputs",
    "# - Supports =int, =float, =bool, =string (default)",
    "# - Comments start with #",
    "# ",
    "# NOTES:",
    "# Adding new files or [Sections] requires a Server Restart to update the node output slots.",
    "# Editing items inside existing sections only requires a Refresh (R).",
    "# You can find more examples in custom_nodes\ComfyUI-IMGNR-Utils\Txt2Combo_Examples.",
    "# Copy them to User>IMGNR-Utils>Txt2Combo to edit and use."
])

# --- API ENDPOINTS ---

@PromptServer.instance.routes.get("/imgnr/txt2combo/get_node_data")
async def get_node_data(request):
    class_name = request.rel_url.query.get("class_name", "")
    if class_name in CLASS_TO_FILE_MAP:
        filename = CLASS_TO_FILE_MAP[class_name]
        full_path = os.path.join(target_dir, filename)
        if os.path.exists(full_path):
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()
                return web.json_response({"filename": filename, "content": content})
            except Exception as e:
                return web.Response(status=500, text=str(e))
    return web.Response(status=404, text="Node config not found")

@PromptServer.instance.routes.post("/imgnr/txt2combo/save")
async def save_txt_combo(request):
    try:
        data = await request.json()
        filename = data.get("filename", "").strip()
        content = data.get("content", "")
        mode = data.get("mode", "populate") 
        
        # 1. Sanitize
        final_filename = re.sub(r'[^\w\-. ]', '', filename)
        if not final_filename: 
            return web.json_response({"success": False, "message": "Invalid filename"})
            
        if not final_filename.lower().endswith(".txt"):
            final_filename += ".txt"

        full_path = os.path.abspath(os.path.join(target_dir, final_filename))
        if not full_path.startswith(os.path.abspath(target_dir)):
            return web.json_response({"success": False, "message": "Path traversal detected"})

        # 2. Check Existing
        is_new_file = not os.path.exists(full_path)
        
        # 3. Write
        write_mode = "w"
        if mode == "append" and not is_new_file:
            write_mode = "a"
            
        new_lines = [line.strip() for line in content.splitlines() if line.strip()]
        text_to_write = "\n".join(new_lines)
        
        prefix = ""
        if write_mode == "a":
            # Check for newline need
            with open(full_path, "r", encoding="utf-8") as f:
                old = f.read()
            if old and not old.endswith("\n"): prefix = "\n"

        with open(full_path, write_mode, encoding="utf-8") as f:
            f.write(prefix + text_to_write)
            
        return web.json_response({
            "success": True, 
            "is_new": is_new_file, 
            "filename": final_filename,
            "mode_used": "Append" if write_mode == "a" else "Overwrite"
        })

    except Exception as e:
        return web.json_response({"success": False, "message": str(e)})

# --- WRITER NODE ---
class Txt2ComboWriter:
    DESCRIPTION = "Manage text lists and lookup tables for Txt2Combo."
    
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
                }),
                "mode": (["overwrite", "append", "populate"], {
                    "default": "populate",
                }),
                "content": ("STRING", {
                    "default": "", 
                    "multiline": True, 
                    "dynamicPrompts": False,
                    "tooltip": "Use ; to separate columns. Use [Section] for new tables."
                }),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": ""},
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("inspect",)
    OUTPUT_TOOLTIPS = ("Connect to Txt2Combo node or ANY combobox to populate widget below",)
    FUNCTION = "process_file"
    CATEGORY = "IMGNR"
    OUTPUT_NODE = True

    def process_file(self, select_file, filename, content, mode, prompt=None, extra_pnginfo=None):
        # This function handles the "Queue Prompt" execution to run the Txt2ComboWriter.
        # It replicates the logic of the API for consistency if used in a workflow.
        
        if select_file != "Create New > Use Filename Below":
            final_filename = select_file
        else:
            final_filename = filename.strip()
            final_filename = re.sub(r'[^\w\-. ]', '', final_filename)
            if not final_filename.lower().endswith(".txt"):
                final_filename += ".txt"

        full_path = os.path.abspath(os.path.join(target_dir, final_filename))
        
        if not full_path.startswith(os.path.abspath(target_dir)):
             return {"ui": {"text": [""]}, "result": ("*")}

        if mode == "populate":
            if os.path.exists(full_path):
                try:
                    with open(full_path, "r", encoding="utf-8") as f:
                        file_content = f.read()
                    return {"ui": { "text": [file_content] }, "result": ("*")}
                except Exception as e:
                    return {"ui": {"text": [""]}, "result": ("*")}
            else:
                return {"ui": {"text": [""]}, "result": ("*")}

        # Write/Append
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
                else:
                    with open(full_path, "w", encoding="utf-8") as f:
                        f.write(text_to_write)
                msg = "Appended"
            else: 
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(text_to_write)
                msg = "Overwrote"

            status_msg = f"Success: {msg} {full_path}"
            print(f"[Txt2Combo Writer] {status_msg}")
            
            return {"ui": { "text": [] }, "result": ("*")}

        except Exception as e:
            return {"ui": {"text": []}, "result": ("*")}


# --- DYNAMIC READER NODE LOGIC ---

class Txt2ComboBase:
    FUNCTION = "select_item"
    CATEGORY = "IMGNR"

    def select_item(self, **kwargs):
        node_data = getattr(self, "node_data", {})
        results = []
        for section_key in self.section_order:
            section_info = node_data.get(section_key)
            if not section_info: continue

            selected_value = kwargs.get(section_key, "")
            found_row = None
            for row in section_info['data_rows']:
                if row[0] == selected_value:
                    found_row = row
                    break
            
            columns = section_info['columns']
            if found_row:
                for i, col_def in enumerate(columns):
                    col_type = col_def[1]
                    if i < len(found_row):
                        val = convert_value(found_row[i], col_type)
                    else:
                        val = col_def[2] 
                    results.append(val)
            else:
                for col_def in columns:
                    results.append(col_def[2])
        return tuple(results)

def parse_file_to_sections(file_path):
    parsed = { "order": [], "sections": {} }
    if not os.path.exists(file_path): return parsed

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except: return parsed

    current_section_name = None
    default_section = "text"
    
    for line in lines:
        line = line.strip()
        if not line: continue
        if line.startswith("#"): continue 

        if line.startswith("["):
            parts = [p.strip() for p in line.split(";") if p.strip()]
            if parts[0].startswith("[") and parts[0].endswith("]"):
                raw_header_1 = parts[0][1:-1]
                col1_name, _, _ = parse_type_def(raw_header_1)
                
                current_section_name = col1_name
                parsed["order"].append(current_section_name)
                parsed["sections"][current_section_name] = {
                    "columns": [], "dropdown_options": [], "data_rows": []
                }
                for p in parts:
                    if p.startswith("[") and p.endswith("]"):
                        parsed["sections"][current_section_name]["columns"].append(parse_type_def(p[1:-1]))
                    else:
                        parsed["sections"][current_section_name]["columns"].append(parse_type_def(p))
                continue

        if current_section_name is None:
            current_section_name = default_section
            parsed["order"].append(current_section_name)
            parsed["sections"][current_section_name] = {
                "columns": [(default_section, "STRING", "")],
                "dropdown_options": [], "data_rows": []
            }
            
        row_values = [v.strip() for v in line.split(";")]
        if row_values:
            parsed["sections"][current_section_name]["dropdown_options"].append(row_values[0])
            parsed["sections"][current_section_name]["data_rows"].append(row_values)

    return parsed


def create_dynamic_node(filename_with_ext):
    file_path = os.path.join(target_dir, filename_with_ext)
    parsed_data = parse_file_to_sections(file_path)
    
    if not parsed_data["order"]:
        parsed_data = {
            "order": ["Error"],
            "sections": {
                "Error": {
                    "columns": [("Error", "STRING", "")],
                    "dropdown_options": ["File Empty or Invalid"],
                    "data_rows": [["File Empty or Invalid"]]
                }
            }
        }

    all_return_types = []
    all_return_names = []
    real_types_for_desc = []

    for section_key in parsed_data["order"]:
        sec = parsed_data["sections"][section_key]
        for col in sec["columns"]:
            all_return_names.append(col[0])
            all_return_types.append(ANY) 
            real_types_for_desc.append(col[1])

    def input_types_method(cls):
        current_data = parse_file_to_sections(file_path)
        if not current_data["order"]:
             return {"required": {"Error": (["Reload Node"],)}}
        inputs = {"required": {}}
        for key in current_data["order"]:
            opts = current_data["sections"][key]["dropdown_options"]
            if not opts: opts = ["None"]
            inputs["required"][key] = (opts, {"default": opts[0]})
        
        inputs["optional"] = {"inspect": (ANY, {"tooltip": "Connect Txt2Combo Writer"})}
        return inputs

    safe_name = filename_with_ext.replace(".", "_").replace(" ", "_")
    internal_class_name = f"Txt2Combo_{safe_name}"
    CLASS_TO_FILE_MAP[internal_class_name] = filename_with_ext

    DynamicClass = type(
        internal_class_name,
        (Txt2ComboBase,), 
        {
            "INPUT_TYPES": classmethod(input_types_method),
            "RETURN_TYPES": tuple(all_return_types),
            "RETURN_NAMES": tuple(all_return_names),
            "OUTPUT_TOOLTIPS": tuple([f"{n} ({t})" for n, t in zip(all_return_names, real_types_for_desc)]),
            "node_data": parsed_data["sections"],
            "section_order": parsed_data["order"]
        }
    )
    return DynamicClass, internal_class_name


NODE_CLASS_MAPPINGS = {"Txt2ComboWriter": Txt2ComboWriter}
NODE_DISPLAY_NAME_MAPPINGS = {"Txt2ComboWriter": "Txt2Combo Writer (IMGNR)"}

if os.path.exists(target_dir):
    files = [f for f in os.listdir(target_dir) if f.endswith('.txt')]
    for filename in files:
        NodeClass, internal_name = create_dynamic_node(filename)
        clean_name = os.path.splitext(filename)[0]
        NODE_CLASS_MAPPINGS[internal_name] = NodeClass
        NODE_DISPLAY_NAME_MAPPINGS[internal_name] = f"Txt2Combo: {clean_name} (IMGNR)"