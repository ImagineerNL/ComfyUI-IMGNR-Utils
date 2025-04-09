# __init__.py for ComfyUI-IMGNR-Utils
from .catch_edit_text import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Tells ComfyUI where to look for Javascript files
WEB_DIRECTORY = "./js"

# --- Structure for Merging Mappings (for future nodes) ---
# Initialize empty dictionaries
ALL_NODE_CLASS_MAPPINGS = {}
ALL_NODE_DISPLAY_NAME_MAPPINGS = {}

# Update with mappings from your first node
ALL_NODE_CLASS_MAPPINGS.update(NODE_CLASS_MAPPINGS)
ALL_NODE_DISPLAY_NAME_MAPPINGS.update(NODE_DISPLAY_NAME_MAPPINGS)

# ALL_NODE_CLASS_MAPPINGS.update(another_class_map)
# ALL_NODE_DISPLAY_NAME_MAPPINGS.update(another_display_map)

# Define __all__ with the final merged dictionaries ComfyUI expects
__all__ = ['ALL_NODE_CLASS_MAPPINGS', 'ALL_NODE_DISPLAY_NAME_MAPPINGS']

# Use the final merged dict names here for ComfyUI discovery
NODE_CLASS_MAPPINGS = ALL_NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS = ALL_NODE_DISPLAY_NAME_MAPPINGS

print("### Loading Custom Nodes: IMGNR Utility Pack")