# IMGNR-Utils/diy_reconstructor.py
# Handles recovery of missing DIY files via Placeholder creation or GitHub download.

import os
import folder_paths
import urllib.request
import urllib.error
import re
from server import PromptServer
from aiohttp import web
import importlib
import sys
import shutil
from . import IMGNR_constants as C

# Import the core logic to trigger hot-reloading
try:
    from . import diy_nodes
except ImportError:
    diy_nodes = None

# --- CONSTANTS ---
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/ImagineerNL/ComfyUI-IMGNR-Utils/main/DIY-node-library/"
TARGET_DIR = os.path.join(folder_paths.get_user_directory(), "IMGNR_Utils", "DIY-nodes")

# Define the local library path (inside the custom node folder)
CURRENT_NODE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_LIBRARY_DIR = os.path.join(CURRENT_NODE_DIR, "DIY-node-library")

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

def get_possible_filenames(base_name):
    """
    Returns a list of possible filenames to check.
    e.g. 'My_File.txt' -> ['My_File.txt', 'My File.txt']
    """
    candidates = [base_name]
    if "_" in base_name:
        candidates.append(base_name.replace("_", " "))
    return candidates

# --- API ENDPOINTS ---

@PromptServer.instance.routes.post("/imgnr/diy/check_local_file")
async def check_local_file(request):
    """
    Checks if the file physically exists on the server disk (User folder OR Local Library).
    Smart check: Looks for 'Name_Name.txt' AND 'Name Name.txt'
    """
    data = await request.json()
    raw_filename = data.get("filename", "")
    raw_filename = sanitize_filename(raw_filename)
    
    if not raw_filename: return web.json_response({"exists": False})
    if not raw_filename.endswith(".txt"): raw_filename += ".txt"
    
    # Check candidates (Underscore vs Space)
    candidates = get_possible_filenames(raw_filename)
    
    found_filename = raw_filename # Default to requested
    exists_in_user = False
    exists_in_library = False
    
    # 1. Check User Directory
    for cand in candidates:
        if os.path.exists(os.path.join(TARGET_DIR, cand)):
            found_filename = cand
            exists_in_user = True
            break
            
    # 2. Check Local Library Directory (if not found in user)
    if not exists_in_user:
        for cand in candidates:
            if os.path.exists(os.path.join(LOCAL_LIBRARY_DIR, cand)):
                found_filename = cand
                exists_in_library = True
                break
    
    return web.json_response({
        "exists_user": exists_in_user, 
        "exists_lib": exists_in_library,
        "user_path": TARGET_DIR,
        "filename": found_filename  # Return the ACTUAL found name
    })

@PromptServer.instance.routes.post("/imgnr/diy/reconstruct_check")
async def reconstruct_check(request):
    data = await request.json()
    raw_filename = data.get("filename", "")
    
    raw_filename = sanitize_filename(raw_filename)
    if not raw_filename: return web.json_response({"exists": False})
    if not raw_filename.endswith(".txt"): raw_filename += ".txt"

    candidates = get_possible_filenames(raw_filename)
    
    for cand in candidates:
        url = f"{GITHUB_RAW_BASE}{cand}"
        try:
            # Need to encode spaces for URL
            safe_url = url.replace(" ", "%20")
            with urllib.request.urlopen(safe_url) as response:
                if response.getcode() == 200:
                    return web.json_response({
                        "exists": True, 
                        "url": url, 
                        "found_name": cand # Tell frontend which one worked
                    })
        except:
            continue

    return web.json_response({"exists": False})

@PromptServer.instance.routes.post("/imgnr/diy/reconstruct_do")
async def reconstruct_do(request):
    data = await request.json()
    action = data.get("action") 
    filename = data.get("filename", "") # This should be the CORRECTED filename from check
    headers = data.get("headers", []) 
    
    filename = sanitize_filename(filename)
    if not filename: return web.json_response({"success": False, "message": "Invalid Filename"})
    if not filename.endswith(".txt"): filename += ".txt"
    
    file_path = os.path.join(TARGET_DIR, filename)
    msg = ""
    was_recreated_scratch = False
    
    # 1. RESTORE LOCAL MODE
    if action == "restore_local":
        source_path = os.path.join(LOCAL_LIBRARY_DIR, filename)
        try:
            if os.path.exists(source_path):
                shutil.copy2(source_path, file_path)
                msg = f"Restored {filename} from Local Library."
            else:
                return web.json_response({"success": False, "message": f"File {filename} not found in local library."})
        except Exception as e:
            return web.json_response({"success": False, "message": f"Restore Failed: {str(e)}"})

    # 2. DOWNLOAD MODE
    elif action == "download":
        url = f"{GITHUB_RAW_BASE}{filename}"
        safe_url = url.replace(" ", "%20")
        try:
            with urllib.request.urlopen(safe_url) as response:
                content = response.read().decode('utf-8')
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
                
            msg = f"Downloaded {filename} from GitHub."
            
        except Exception as e:
            # FALLBACK TO SCRATCH
            print(f"{C.WARN_PREFIX} [DIY Nodes] Download failed ({e}), attempting scratch creation.")
            success, err = create_placeholder(file_path, filename, headers)
            if success:
                msg = f"{filename} not found on github, trying to recreate from scratch."
                was_recreated_scratch = True
            else:
                return web.json_response({"success": False, "message": f"Download & Creation Failed: {err}"})

    # 3. CREATE PLACEHOLDER MODE
    elif action == "create":
        success, err = create_placeholder(file_path, filename, headers)
        if success:
            msg = f"Created placeholder for {filename}."
            was_recreated_scratch = True
        else:
            return web.json_response({"success": False, "message": f"Creation Failed: {err}"})
    
    else:
        return web.json_response({"success": False, "message": "Invalid Action"})

    # 4. FINAL RESPONSE
    final_msg = "Node restored; ComfyUI server needs to be restarted for node to be loaded; values and sections might still mismatch due to customizations by workflow owner."
    print(f"{C.WARN_PREFIX} DIY {final_msg}")
    return web.json_response({"success": True, "message": final_msg})

class DIYReconstructor:
    def __init__(self): pass
    
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}