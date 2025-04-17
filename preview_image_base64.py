# IMGNR UtilityPack/preview_image_base64
# Version: 1.0 - First Publication

import os
import torch
import numpy as np
from PIL import Image
import base64
import io

class PreviewImageBase64Node:
    """
    Displays input images using Base64 encoded previews embedded in the UI message.
    Also passes the original IMAGE data through to an output slot.
    Does NOT save any temporary files to disk for the preview itself.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", ),
            }
        }


    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "encode_preview_and_pass_image"
    OUTPUT_NODE = True # Keep True for reliable preview generation
    CATEGORY = "IMGNR/Utils"

    def tensor_to_pil(self, img_tensor: torch.Tensor) -> list[Image.Image]:
        # Converts B,H,W,C or H,W,C tensor to list of PIL Images
        # Process only first image for preview if batch provided
        img_tensor = img_tensor.cpu()
        if img_tensor.ndim == 3: img_tensor = img_tensor.unsqueeze(0)
        images = []
        if img_tensor.shape[0] > 0:
             img = img_tensor[0]; img_np = np.clip(255. * img.numpy(), 0, 255).astype(np.uint8); images.append(Image.fromarray(img_np))
        return images

    def encode_preview_and_pass_image(self, images: torch.Tensor):
        ui_payload = []
        class_name_log = self.__class__.__name__
        output_images = images # Store original tensor for output

        # Handle case where input is None
        if images is None:
            print(f"[{class_name_log}] No image input provided.")
            # Return empty UI payload and maybe an empty tensor for the output?
            # Creating an empty tensor might be better than returning None for IMAGE type
            output_images = torch.zeros([1, 64, 64, 3], dtype=torch.float32)
            return {"ui": {"imgnr_b64_previews": []}, "result": (output_images,)}

        # Generate Base64 preview data
        try:
            pil_images_for_preview = self.tensor_to_pil(images)
            if pil_images_for_preview: # Check if list is not empty
                img_for_preview = pil_images_for_preview[0]
                width, height = img_for_preview.size

                buffer = io.BytesIO()
                img_for_preview.save(buffer, format="PNG", compress_level=4)
                img_bytes = buffer.getvalue()
                base64_encoded = base64.b64encode(img_bytes).decode('utf-8')
                data_uri = f"data:image/png;base64,{base64_encoded}"

                # Use custom UI key, include dimensions needed by JS
                ui_payload.append({
                    "image": data_uri,
                    "width": width,
                    "height": height
                })
                # print(f"[{class_name_log}] Encoded image ({width}x{height}) to Base64 Data URI.") # Optional log
            else:
                 print(f"[{class_name_log}] No valid PIL images converted for preview.")

        except Exception as e:
            print(f"[{class_name_log}] Error processing image for preview: {e}")
            # Continue to return original image tensor even if preview fails

         # Use the custom key "imgnr_b64_previews" for the UI data
        # Include the original input 'images' tensor in the 'result' tuple
        return {"ui": {"imgnr_b64_previews": ui_payload}, "result": (output_images,)}
        # ------------------------------------------------------------------

# === ComfyUI Registration ===
NODE_CLASS_MAPPINGS = {
    "PreviewImageBase64Node": PreviewImageBase64Node
    }
NODE_DISPLAY_NAME_MAPPINGS = {
    "PreviewImageBase64Node": "Preview Image - No Save (IMGNR)"
    }