# IMGNR-Utils/preview_image_base64
# Fixes: Transparant (RGBA) images (+ mask in/out)
# Fixes: Widget background now same as template node color
# Fixes: Zero size widget on spawn due to no image (using placeholder)
# New: Adhoc Save Node
# Updated: Renamed Sequence to Counter & Added Toggle
# Updated: Added Metadata Diff & Comparison Payload
# Fixed: JSON Serialization error (NaN)
# Fixed: Preview Node now correctly passes metadata for diffing
# Updated: Renamed Preview Ad-hoc Save - LastGen Compare (IMGNR)
# FINAL: Split into 3 distinct nodes (No Save, Ad-Hoc Save, Compare)

import os
import torch
import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import base64
import io
import json
import math
import sys
from server import PromptServer
from aiohttp import web
import folder_paths
from . import IMGNR_constants as C

# --- UTILITY: SAVE FUNCTION ---
def save_image_to_disk(image_data_base64, filename_main, counter, add_counter, filename_extras, overwrite, embed_workflow=False, prompt=None, extra_pnginfo=None, output_dir=""):
    try:
        # 1. Decode Image
        if "," in image_data_base64:
            image_data_base64 = image_data_base64.split(",")[1]
        image_bytes = base64.b64decode(image_data_base64)
        img = Image.open(io.BytesIO(image_bytes))

        # 2. Handle Metadata (Workflow)
        metadata = PngInfo()
        if embed_workflow:
            if prompt is not None:
                metadata.add_text("prompt", json.dumps(prompt))
            if extra_pnginfo is not None:
                for x in extra_pnginfo:
                    metadata.add_text(x, json.dumps(extra_pnginfo[x]))

        # 3. Construct Filename
        if not filename_main: filename_main = "ComfyUI"

        extras_str = f"_{filename_extras}" if filename_extras and filename_extras.strip() else ""
        
        full_output_dir = folder_paths.get_output_directory()
        if output_dir: 
             full_output_dir = output_dir
        
        # Split prefix to handle subfolders
        if "/" in filename_main or "\\" in filename_main:
            path_part, filename_part = os.path.split(filename_main)
            save_path = os.path.join(full_output_dir, path_part)
        else:
            filename_part = filename_main
            save_path = full_output_dir

        if not os.path.exists(save_path):
            os.makedirs(save_path)

        # LOGIC: Add Counter or Not?
        if add_counter:
            counter_str = f"_{int(counter):05d}"
            base_filename_no_ext = f"{filename_part}{counter_str}{extras_str}"
        else:
            base_filename_no_ext = f"{filename_part}{extras_str}"

        file_extension = ".png"
        full_file_path = os.path.join(save_path, base_filename_no_ext + file_extension)

        # 4. Handle Overwrite
        if os.path.exists(full_file_path) and not overwrite:
            safety_idx = 1
            while os.path.exists(full_file_path):
                new_base = f"{base_filename_no_ext}_{safety_idx:03d}"
                full_file_path = os.path.join(save_path, new_base + file_extension)
                safety_idx += 1

        # 5. Save
        img.save(full_file_path, pnginfo=metadata, compress_level=4)
        
        # 6. Return Data
        relative_path = os.path.relpath(full_file_path, folder_paths.get_output_directory())
        
        # Increment counter ONLY if add_counter was active
        next_counter = int(counter) + 1 if add_counter else int(counter)
        
        return True, full_file_path, relative_path, next_counter, base_filename_no_ext

    except Exception as e:
        print(f"{C.ERR_PREFIX} Save Error: {e}")
        return False, str(e), "", counter, ""

# --- API: MANUAL SAVE ---
@PromptServer.instance.routes.post("/imgnr/save_manual")
async def imgnr_save_manual(request):
    data = await request.json()
    success, full_path, rel_path, new_cnt, base_name = save_image_to_disk(
        image_data_base64=data.get("image"),
        filename_main=data.get("filename_main"),
        counter=data.get("counter"),
        add_counter=data.get("add_counter"),
        filename_extras=data.get("filename_extras"),
        overwrite=data.get("overwrite"),
        embed_workflow=False 
    )
    return web.json_response({
        "success": success, 
        "message": full_path if success else rel_path, 
        "relative_path": rel_path,
        "new_counter": new_cnt
    })


# --- BASE CLASS LOGIC ---
class IMGNR_Preview_Base:
    def tensor_to_pil(self, img_tensor):
        if img_tensor.ndim == 3: img_tensor = img_tensor.unsqueeze(0)
        arr = np.clip(255. * img_tensor[0].cpu().numpy(), 0, 255).astype(np.uint8)
        
        # Explicitly enforce RGBA mode to prevent PIL from auto-stripping the alpha channel
        if arr.shape[-1] == 4:
            return Image.fromarray(arr, mode="RGBA")
        return Image.fromarray(arr, mode="RGB")

    def prepare_rgba(self, images, mask=None):
        output_images = images
        output_mask = None

        if mask is not None:
             if mask.ndim == 2: mask = mask.unsqueeze(0)
             if mask.shape[0] == 1 and images.shape[0] > 1:
                 mask = mask.repeat(images.shape[0], 1, 1)
             if mask.shape[1:] != images.shape[1:3]:
                 mask = torch.nn.functional.interpolate(
                     mask.unsqueeze(1), size=images.shape[1:3], mode='nearest'
                 ).squeeze(1)
             alpha = 1.0 - mask
             output_images = torch.cat((images[..., :3], alpha.unsqueeze(-1)), dim=-1)
             output_mask = mask

        elif images.shape[-1] == 4:
             output_images = images
             output_mask = 1.0 - images[..., 3]
        else:
             output_mask = torch.zeros((images.shape[0], images.shape[1], images.shape[2]), dtype=torch.float32, device=images.device)
        
        return output_images, output_mask

    # Helper to recursively sanitize JSON (convert NaN/Inf to None)
    def clean_json(self, data):
        if isinstance(data, dict):
            return {k: self.clean_json(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self.clean_json(v) for v in data]
        elif isinstance(data, float):
            if math.isnan(data) or math.isinf(data):
                return None
        return data

    # Fixed signature: Now includes unique_id=None to handle ComfyUI's hidden inputs without crashing
    def process_image(self, images, mask=None, filename_main="ComfyUI", counter=1, add_counter=True, filename_extras="", autosave=False, embed_workflow=False, overwrite=False, prompt=None, extra_pnginfo=None, unique_id=None):
        ui_payload = []
        current_cnt = counter
        saved_rel_path = None 
        
        extras_str = f"_{filename_extras}" if filename_extras and filename_extras.strip() else ""
        
        if "/" in filename_main or "\\" in filename_main:
             _, fname_part = os.path.split(filename_main)
             base_part = fname_part
        else:
             base_part = filename_main

        if add_counter:
            cnt_str = f"_{int(current_cnt):05d}"
            full_filename_str = f"{base_part}{cnt_str}{extras_str}"
        else:
            full_filename_str = f"{base_part}{extras_str}"

        rgba_images, output_mask = self.prepare_rgba(images, mask)

        if rgba_images is None:
             empty = torch.zeros([1, 64, 64, 3])
             return {"ui": {"imgnr_b64_previews": []}, "result": (empty, empty, filename_main, current_cnt, "")}

        try:
            pil_img = self.tensor_to_pil(rgba_images)
            buffer = io.BytesIO()
            pil_img.save(buffer, format="PNG", compress_level=4)
            img_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
            data_uri = f"data:image/png;base64,{img_b64}"
            
            if autosave:
                 _, _, saved_rel_path, next_cnt, saved_base_name = save_image_to_disk(
                     img_b64, filename_main, current_cnt, add_counter, filename_extras, overwrite, 
                     embed_workflow, prompt, extra_pnginfo
                 )
                 current_cnt = next_cnt
                 full_filename_str = saved_base_name 

            # Flatten relevant metadata for easy JS Diffing
            raw_meta = {}
            if prompt is not None:
                raw_meta["prompt"] = prompt
            
            # SANITIZE: Ensure no NaNs get sent to frontend
            meta_payload = self.clean_json(raw_meta)

            ui_payload.append({
                "image": data_uri,
                "width": pil_img.width,
                "height": pil_img.height,
                "current_counter": current_cnt,
                "saved_filename": saved_rel_path,
                "params": {
                    "filename_main": filename_main,
                    "filename_extras": filename_extras,
                    "add_counter": add_counter,
                    "overwrite": overwrite
                },
                "meta": meta_payload # Passed to JS for A/B Diff
            })

        except Exception as e:
            print(f"{C.ERR_PREFIX} [IMGNR_Preview] Error: {e}")
        
        return {
            "ui": {"imgnr_b64_previews": ui_payload}, 
            "result": (rgba_images, output_mask, filename_main, current_cnt, full_filename_str)
        }


# --- NODE 1: PREVIEW ONLY (NO SAVE) ---
class PreviewImageBase64Node(IMGNR_Preview_Base):
    DESCRIPTION = "Displays input images without saving to disk."
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": { "images": ("IMAGE",) },
            "optional": { "mask": ("MASK",) },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }
    
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "run"
    OUTPUT_NODE = True 
    CATEGORY = "IMGNR"

    def run(self, images, mask=None, prompt=None, extra_pnginfo=None):
        res = self.process_image(images, mask, prompt=prompt, extra_pnginfo=extra_pnginfo)
        return {"ui": res["ui"], "result": (res["result"][0], res["result"][1])}


# --- NODE 2: AD-HOC SAVE (NO COMPARE) ---
class PreviewImageAdHocSaveNode(IMGNR_Preview_Base):
    DESCRIPTION = """
    Displays input images and allows Auto saving or Manual saving _after_ image generation.
    Optimized memory (drops history payload).
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
                "filename_main": ("STRING", {"default": "ComfyUI"}),
                "counter": ("INT", {"default": 1, "min": 0, "max": 999999, "step": 1}),
                "add_counter": ("BOOLEAN", {"default": True}),
                "filename_extras": ("STRING", {"default": ""}),
                "autosave": ("BOOLEAN", {"default": False}),
                "embed_workflow": ("BOOLEAN", {"default": True}), 
                "overwrite": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "mask": ("MASK", ),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "INT", "STRING")
    RETURN_NAMES = ("image", "mask", "filename_main", "counter_out", "full_filename")
    FUNCTION = "run"
    OUTPUT_NODE = True 
    CATEGORY = "IMGNR"

    def run(self, **kwargs):
        res = self.process_image(**kwargs)
        return {"ui": res["ui"], "result": res["result"]}


# --- NODE 3: COMPARE NODE (SAVE + COMPARE) ---
class PreviewImageCompareNode(IMGNR_Preview_Base):
    DESCRIPTION = """
    Displays input images and allows Auto saving or Manual saving _after_ image generation.
    Includes LastGen Comparison tools in the UI (Always On).
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
                "filename_main": ("STRING", {"default": "ComfyUI"}),
                "counter": ("INT", {"default": 1, "min": 0, "max": 999999, "step": 1}),
                "add_counter": ("BOOLEAN", {"default": True}),
                "filename_extras": ("STRING", {"default": ""}),
                "autosave": ("BOOLEAN", {"default": False}),
                "embed_workflow": ("BOOLEAN", {"default": True}), 
                "overwrite": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "mask": ("MASK", ),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "INT", "STRING")
    RETURN_NAMES = ("image", "mask", "filename_main", "counter_out", "full_filename")
    FUNCTION = "run"
    OUTPUT_NODE = True 
    CATEGORY = "IMGNR"

    def run(self, **kwargs):
        res = self.process_image(**kwargs)
        return {"ui": res["ui"], "result": res["result"]}


# --- REGISTER NODES ---
NODE_CLASS_MAPPINGS = {
    "PreviewImageBase64Node": PreviewImageBase64Node,
    "PreviewImageAdHocSaveNode": PreviewImageAdHocSaveNode,
    "PreviewImageCompareNode": PreviewImageCompareNode
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "PreviewImageBase64Node": "Preview Image - No Save (IMGNR)",
    "PreviewImageAdHocSaveNode": "Preview Image - Ad-hoc Save (IMGNR)",
    "PreviewImageCompareNode": "Preview Compare LastGen (IMGNR)"
}