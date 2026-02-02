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

# --- HELPER: PARSING & VALIDATION ---

def split_line_respecting_brackets(line):
    parts = []
    buffer = ""
    balance = 0
    for char in line:
        if char == "[": balance += 1
        elif char == "]": balance -= 1
        
        if char == ";" and balance == 0:
            if buffer.strip(): parts.append(buffer.strip())
            buffer = ""
        else:
            buffer += char
    if buffer.strip(): parts.append(buffer.strip())
    return parts

def validate_text_content(content):
    """
    Strict validation of the configuration text.
    Returns (True, []) if valid, or (False, [errors]) if invalid.
    """
    lines = content.splitlines()
    errors = []
    
    VALID_TYPES = {"string", "int", "float", "bool", "textbox"}
    VALID_ATTRS = {"output", "default"}
    VALID_BOOLS = {"true", "false", "yes", "no", "0", "1", "on", "off"}
    
    defined_names = set()
    
    # --- PASS 1: Harvest Names ---
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"): continue

        if line.startswith("["):
            parts = split_line_respecting_brackets(line)
            # Check Concat
            if parts[0].lower().startswith("[concat="):
                try:
                    def_str = parts[0][1:-1] # remove []
                    _, name = def_str.split("=", 1)
                    defined_names.add(name.strip())
                except: pass
            # Check Sections
            elif parts[0].startswith("["):
                for p in parts:
                    clean = p.strip()
                    if clean.startswith("[") and clean.endswith("]"):
                        clean = clean[1:-1]
                    # definition is before first semicolon
                    definition = clean.split(";")[0]
                    if "=" in definition:
                        name = definition.split("=")[0].strip()
                        defined_names.add(name)
                    else:
                        defined_names.add(definition.strip())

    # --- PASS 2: Detail Validation ---
    current_section_cols = 0
    inside_section = False
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line or line.startswith("#"): continue
        
        # A. HEADERS
        if line.startswith("["):
            # Bracket Balance
            if line.count("[") != line.count("]"):
                errors.append(f"Line {i+1}: Unbalanced brackets.")
                continue
                
            parts = split_line_respecting_brackets(line)
            
            # 1. CONCAT
            if parts[0].lower().startswith("[concat="):
                for k in range(1, len(parts)):
                    p = parts[k].strip()
                    if p.startswith("[") and p.endswith("]"):
                        ref = p[1:-1].strip()
                        if ref not in defined_names:
                            errors.append(f"Line {i+1}: Unknown reference '{ref}' in concat.")
                    elif not (p.startswith('"') and p.endswith('"')):
                        errors.append(f"Line {i+1}: Invalid concat part '{p}'. Must be [Ref] or \"Text\".")
                inside_section = False
                continue
            
            # 2. SECTION
            inside_section = True
            current_section_cols = len(parts)
            
            for part in parts:
                clean = part.strip()
                if clean.startswith("[") and clean.endswith("]"):
                    clean = clean[1:-1]
                
                sub_parts = [s.strip() for s in clean.split(";") if s.strip()]
                
                # Check Type
                main_def = sub_parts[0]
                col_type = "string"
                if "=" in main_def:
                    _, type_str = main_def.split("=", 1)
                    col_type = type_str.lower().strip()
                
                if col_type not in VALID_TYPES:
                    errors.append(f"Line {i+1}: Invalid type '{col_type}'. Valid: {', '.join(VALID_TYPES)}")
                
                # Check Attributes
                for attr in sub_parts[1:]:
                    if "=" not in attr:
                        errors.append(f"Line {i+1}: Invalid attribute format '{attr}'. Use key=value.")
                        continue
                    k, v = attr.split("=", 1)
                    k = k.lower().strip()
                    v = v.lower().strip()
                    
                    if k not in VALID_ATTRS:
                        errors.append(f"Line {i+1}: Unknown attribute '{k}'.")
                    elif k == "output":
                        if v not in VALID_BOOLS:
                            errors.append(f"Line {i+1}: Invalid boolean '{v}' for output.")

            continue

        # B. DATA ROWS
        if inside_section:
            cols = line.split(";")
            if len(cols) > current_section_cols:
                errors.append(f"Line {i+1}: Too many values. Expected {current_section_cols}, found {len(cols)}.")

    return (len(errors) == 0, errors)

# --- HELPER: TYPE CONVERSION ---
def parse_type_def(header_part):
    clean_part = header_part.strip()
    
    # Remove surrounding brackets if present for processing
    if clean_part.startswith("[") and clean_part.endswith("]"):
        clean_part = clean_part[1:-1]

    # Split by semicolon to find attributes (e.g. Name=int;output=false)
    sub_parts = [s.strip() for s in clean_part.split(";") if s.strip()]
    
    # The first part is always "Name" or "Name=Type"
    main_def = sub_parts[0]
    
    col_name = main_def
    col_type = "STRING"
    default_val = ""
    visible = True
    is_textbox = False

    if "=" in main_def:
        name_str, type_str = main_def.split("=", 1)
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
        elif type_str == "textbox":
            col_type = "TEXTBOX" # Special internal flag
            default_val = ""

    # Process additional attributes (output=false, etc)
    for attr in sub_parts[1:]:
        if "=" in attr:
            k, v = attr.split("=", 1)
            k = k.strip().lower()
            v = v.strip().lower()
            if k == "output" and v in ["false", "no", "0"]:
                visible = False
            # We could handle default=... here if needed in future

    return {
        "name": col_name, 
        "type": col_type, 
        "default": default_val, 
        "visible": visible
    }

def convert_value(value_str, target_type):
    value_str = str(value_str).strip() # Ensure string
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
    "",
    "# creates a textbox with the name 'Prompt'",
    "[Prompt=Textbox]",
    "# Creates 2 string and 1 int inputfield and does not send them to an output",
    "[firstname=string;output=false]",
    "[lastname=string;output=false]",
    "[number=int;output=false]",
    "",
    "# creates an output 'fullname' which sends the content of the inputfields", 
    "[concat=fullname];[firstname];\" \";[lastname];\"_nr\";[number]",
    "# 'firstname lastname_nrnumber' could be 'John Doe_nr3'", 
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
        
        # 1. VALIDATION (Backend Side)
        is_valid, errors = validate_text_content(content)
        if not is_valid:
            error_msg = "\n".join(errors)
            # This print ensures it shows up in ComfyUI Console
            print(f"\n[Txt2Combo] Validation Failed:\n{error_msg}\n", flush=True)
            return web.json_response({"success": False, "message": error_msg})

        # 2. Sanitize
        final_filename = re.sub(r'[^\w\-. ]', '', filename)
        if not final_filename: 
            print(f"\n[Txt2Combo] Write Failed: Invalid Filename", flush=True)
            return web.json_response({"success": False, "message": "Write Failed: Invalid filename"})
            
        if not final_filename.lower().endswith(".txt"):
            final_filename += ".txt"

        full_path = os.path.abspath(os.path.join(target_dir, final_filename))
        if not full_path.startswith(os.path.abspath(target_dir)):
            print(f"\n[Txt2Combo] Write Failed: Unwanted Path traversal detected", flush=True)
            return web.json_response({"success": False, "message": "Unwanted Path traversal detected"})

        # 3. Check Existing
        is_new_file = not os.path.exists(full_path)
        
        # NEW SAFETY CHECK
        if not is_new_file and mode == "populate":
            print(f"\n[Txt2Combo] Write Failed: File exists. Change filename or use Overwrite/Append.", flush=True)
            return web.json_response({
                "success": False, 
                "message": "Write Failed: File exists. Change filename or use Overwrite/Append."
            })
        
        # 4. Write
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
        
        # 3. Validation Logic (EXECUTION PATH)
        is_valid, errors = validate_text_content(content)
        if not is_valid:
            error_msg = "\n".join(errors)
            print(f"\n[Txt2Combo Writer] Validation Failed during execution:\n{error_msg}\n", flush=True)
            # RAISE EXCEPTION TO SHOW MODAL
            raise ValueError(f"Txt2Combo Validation Failed:\n{error_msg}")

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
            
            return {
                "ui": {
                    "status": {"text": "Success", "color": "var(--input-text)", "title": status_msg}
                },
                "result": ("*",)
            }

        except Exception as e:
            raise ValueError(f"Write Error: {e}")


# --- DYNAMIC READER NODE LOGIC ---

class Txt2ComboBase:
    FUNCTION = "select_item"
    CATEGORY = "IMGNR"

    def select_item(self, **kwargs):
        # 1. Setup Context
        node_data = getattr(self, "node_data", {})
        sections = node_data.get("sections", {})
        concats = node_data.get("concats", [])
        
        # 'context' holds the resolved values for every column (even hidden ones)
        context = {} 

        # 2. Process Standard Inputs (Combos & Fields)
        for section_key in self.section_order:
            section_info = sections.get(section_key)
            if not section_info: continue

            columns = section_info['columns']
            
            # Determine if this section is a Combo (has rows) or Widget (no rows)
            if len(section_info['data_rows']) > 0:
                # --- Combo Logic ---
                selected_value = kwargs.get(section_key, "")
                found_row = None
                for row in section_info['data_rows']:
                    if row[0] == selected_value:
                        found_row = row
                        break
                
                for i, col_def in enumerate(columns):
                    col_type = col_def['type'].replace("TEXTBOX", "STRING") # Treat textbox as string
                    val = col_def['default']
                    if found_row and i < len(found_row):
                        val = found_row[i]
                    
                    context[col_def['name']] = convert_value(val, col_type)
            else:
                # --- Widget Logic ---
                # For sections with no rows, we expect the User Input to provide the value
                # The input name corresponds to the section key (first column name)
                input_val = kwargs.get(section_key, "")
                
                # Store the primary input value
                primary_col = columns[0]
                context[primary_col['name']] = convert_value(input_val, primary_col['type'].replace("TEXTBOX", "STRING"))

        # 3. Process Concatenations
        for cat in concats:
            parts = cat['parts']
            final_str = ""
            for p in parts:
                p = p.strip()
                if p.startswith('"') and p.endswith('"'):
                    # Literal String "..."
                    final_str += p[1:-1]
                elif p.startswith("[") and p.endswith("]"):
                    # Variable Reference [...]
                    ref_name = p[1:-1]
                    if ref_name in context:
                        final_str += str(context[ref_name])
                # ignore other formats as per instruction
            context[cat['name']] = final_str

        # 4. Map Context to Outputs
        # We must return values in the exact order of RETURN_NAMES
        results = []
        for name in self.output_names_ordered:
            results.append(context.get(name, ""))
            
        return tuple(results)

def parse_file_to_sections(file_path):
    parsed = { 
        "order": [], # Order of sections (widgets)
        "sections": {}, 
        "concats": [] 
    }
    if not os.path.exists(file_path): return parsed

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except: return parsed

    current_section_name = None
    default_section = "text"
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"): continue

        if line.startswith("["):
            parts = split_line_respecting_brackets(line)
            
            # CHECK FOR CONCAT: [concat=Name]
            first_part_lower = parts[0].lower()
            if first_part_lower.startswith("[concat="):
                # Parse Concat Definition
                def_str = parts[0][1:-1] # remove []
                _, name = def_str.split("=", 1)
                name = name.strip()
                
                parsed["concats"].append({
                    "name": name,
                    "parts": parts[1:], # remaining parts are the concat elements
                    "visible": True
                })
                current_section_name = None # Reset context
                continue

            # CHECK FOR SECTION
            # It is a section header. Parse columns.
            if parts[0].startswith("[") and parts[0].endswith("]"):
                cols_defs = [parse_type_def(p) for p in parts]
                
                current_section_name = cols_defs[0]['name']
                parsed["order"].append(current_section_name)
                parsed["sections"][current_section_name] = {
                    "columns": cols_defs,
                    "dropdown_options": [],
                    "data_rows": []
                }
                continue

        # DATA ROWS
        if current_section_name:
            row_values = [v.strip() for v in line.split(";")]
            if row_values:
                parsed["sections"][current_section_name]["dropdown_options"].append(row_values[0])
                parsed["sections"][current_section_name]["data_rows"].append(row_values)
        elif not parsed["order"] and not parsed["concats"]:
            # Fallback for files without headers (legacy support/robustness)
            current_section_name = default_section
            parsed["order"].append(current_section_name)
            parsed["sections"][current_section_name] = {
                "columns": [{"name": default_section, "type": "STRING", "default": "", "visible": True}],
                "dropdown_options": [], "data_rows": []
            }
            row_values = [v.strip() for v in line.split(";")]
            parsed["sections"][current_section_name]["dropdown_options"].append(row_values[0])
            parsed["sections"][current_section_name]["data_rows"].append(row_values)

    return parsed


def create_dynamic_node(filename_with_ext):
    file_path = os.path.join(target_dir, filename_with_ext)
    parsed_data = parse_file_to_sections(file_path)
    
    # Validation / Default
    if not parsed_data["order"] and not parsed_data["concats"]:
        parsed_data = {
            "order": ["Error"],
            "sections": {
                "Error": {
                    "columns": [{"name": "Error", "type": "STRING", "default": "", "visible": True}],
                    "dropdown_options": ["File Empty or Invalid"],
                    "data_rows": [["File Empty or Invalid"]]
                }
            },
            "concats": []
        }

    all_return_types = []
    all_return_names = []
    real_types_for_desc = []
    
    # 1. Build Outputs from Sections
    for section_key in parsed_data["order"]:
        sec = parsed_data["sections"][section_key]
        for col in sec["columns"]:
            if col['visible']:
                all_return_names.append(col['name'])
                all_return_types.append(ANY)
                real_types_for_desc.append(col['type'])

    # 2. Build Outputs from Concats
    for cat in parsed_data["concats"]:
        if cat['visible']:
            all_return_names.append(cat['name'])
            all_return_types.append(ANY)
            real_types_for_desc.append("STRING")

    def input_types_method(cls):
        current_data = parse_file_to_sections(file_path)
        if not current_data["order"] and not current_data["concats"]:
             return {"required": {"Error": (["Reload Node"],)}}
        
        inputs = {"required": {}}
        
        for key in current_data["order"]:
            sec = current_data["sections"][key]
            
            # CHECK: Combo vs Widget
            if len(sec["data_rows"]) > 0:
                # COMBO MODE
                opts = sec["dropdown_options"]
                if not opts: opts = ["None"]
                inputs["required"][key] = (opts, {"default": opts[0]})
            else:
                # WIDGET MODE (Input Fields)
                # Use the definition of the first column for the widget type
                col_def = sec["columns"][0]
                t = col_def["type"]
                d = col_def["default"]

                if t == "INT":
                    val = int(d) if d else 0
                    inputs["required"][key] = ("INT", {"default": val, "display": "number"})
                elif t == "FLOAT":
                    val = float(d) if d else 0.0
                    inputs["required"][key] = ("FLOAT", {"default": val, "display": "number"})
                elif t == "BOOLEAN":
                    val = (str(d).lower() == "true")
                    inputs["required"][key] = ("BOOLEAN", {"default": val})
                elif t == "TEXTBOX":
                    inputs["required"][key] = ("STRING", {"multiline": True, "default": str(d)})
                else:
                    inputs["required"][key] = ("STRING", {"multiline": False, "default": str(d)})
        
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
            "RETURN_TYPES": tuple(all_return_types) if all_return_types else (ANY,),
            "RETURN_NAMES": tuple(all_return_names) if all_return_names else ("none",),
            "OUTPUT_TOOLTIPS": tuple([f"{n} ({t})" for n, t in zip(all_return_names, real_types_for_desc)]),
            "node_data": parsed_data,
            "section_order": parsed_data["order"],
            "output_names_ordered": all_return_names
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