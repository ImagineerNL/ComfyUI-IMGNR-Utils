# IMGNR-Utils/Txt2Combo_Reconstructor.py
# Handles recovery of missing Txt2Combo files via Placeholder creation or GitHub download.

import os
import folder_paths
import urllib.request
import urllib.error
import re
from server import PromptServer
from aiohttp import web
import importlib
import sys

# Import the core logic to trigger hot-reloading
try:
    from . import txt2combo
except ImportError:
    txt2combo = None

# --- CONSTANTS ---
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/ImagineerNL/ComfyUI-IMGNR-Utils/main/Txt2Combo_Examples/"
TARGET_DIR = os.path.join(folder_paths.get_user_directory(), "IMGNR_Utils", "txt2combo")

# --- UTILS ---
def sanitize_filename(filename):
    # Strictly allow only Alphanumeric, Underscore, Dash, Dot, Space
    return re.sub(r'[^\w\-. ]', '', filename)

def create_placeholder(file_path, filename, headers):
    try:
        safe_headers = [sanitize_filename(h) for h in headers]
        header_str = "; ".join([f"[{h}]" for h in safe_headers])
        data_str = "; ".join(["Default"] * len(safe_headers))
        content = f"# Auto-Reconstructed Placeholder\n{header_str}\n{data_str}"
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return True, None
    except Exception as e:
        return False, str(e)

# --- API ENDPOINTS ---

@PromptServer.instance.routes.post("/imgnr/txt2combo/check_local_file")
async def check_local_file(request):
    """
    Checks if the file physically exists on the server disk.
    """
    data = await request.json()
    filename = data.get("filename", "")
    filename = sanitize_filename(filename)
    
    if not filename: return web.json_response({"exists": False})
    if not filename.endswith(".txt"): filename += ".txt"
    
    full_path = os.path.join(TARGET_DIR, filename)
    exists = os.path.exists(full_path)
    
    return web.json_response({
        "exists": exists, 
        "path": TARGET_DIR,
        "filename": filename
    })

@PromptServer.instance.routes.post("/imgnr/txt2combo/reconstruct_check")
async def reconstruct_check(request):
    data = await request.json()
    filename = data.get("filename", "")
    
    filename = sanitize_filename(filename)
    if not filename: return web.json_response({"exists": False})

    if not filename.endswith(".txt"): filename += ".txt"
    url = f"{GITHUB_RAW_BASE}{filename}"
    
    try:
        with urllib.request.urlopen(url) as response:
            if response.getcode() == 200:
                return web.json_response({"exists": True, "url": url})
            return web.json_response({"exists": False})
    except urllib.error.HTTPError:
        return web.json_response({"exists": False})
    except Exception as e:
        return web.json_response({"exists": False, "error": str(e)})

@PromptServer.instance.routes.post("/imgnr/txt2combo/reconstruct_do")
async def reconstruct_do(request):
    data = await request.json()
    action = data.get("action") 
    filename = data.get("filename", "")
    headers = data.get("headers", []) 
    
    # SECURITY: Sanitize to prevent path traversal
    filename = sanitize_filename(filename)
    if not filename: 
        return web.json_response({"success": False, "message": "Invalid Filename"})

    if not filename.endswith(".txt"): filename += ".txt"
    file_path = os.path.join(TARGET_DIR, filename)
    
    msg = ""
    was_recreated_scratch = False

    # 1. DOWNLOAD MODE
    if action == "download":
        url = f"{GITHUB_RAW_BASE}{filename}"
        try:
            with urllib.request.urlopen(url) as response:
                content = response.read().decode('utf-8')
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
                
            msg = f"Downloaded {filename} from GitHub."
            
        except Exception as e:
            # FALLBACK TO SCRATCH
            print(f"[Txt2Combo] Download failed ({e}), attempting scratch creation.")
            success, err = create_placeholder(file_path, filename, headers)
            if success:
                # Use actual filename variable
                msg = f"{filename} not found on github, trying to recreate from scratch."
                was_recreated_scratch = True
            else:
                return web.json_response({"success": False, "message": f"Download & Creation Failed: {err}"})

    # 2. CREATE PLACEHOLDER MODE
    elif action == "create":
        success, err = create_placeholder(file_path, filename, headers)
        if success:
            msg = f"Created placeholder for {filename}."
            was_recreated_scratch = True
        else:
            return web.json_response({"success": False, "message": f"Creation Failed: {err}"})
    
    else:
        return web.json_response({"success": False, "message": "Invalid Action"})

    # 3. HOT RELOAD
    if txt2combo:
        try:
            txt2combo.create_dynamic_node(filename)
            
            # Determine success message
            final_msg = "Node successfully restored from Library."
            
            if was_recreated_scratch:
                final_msg = "Node successfully recreated; values and sections might still mismatch due to customizations by workflow owner."

            return web.json_response({"success": True, "message": final_msg})
        except Exception as e:
            print(f"[Txt2Combo Reconstructor] File saved, but Hot-Reload failed: {e}")
            return web.json_response({"success": True, "message": f"{msg} (Restart Required)"})
            
    return web.json_response({"success": True, "message": f"{msg} (Restart Required)"})

class Txt2ComboReconstructor:
    def __init__(self): pass
    
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}