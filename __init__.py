# IMGNR Utils /__init__.py

# Import 1st node
from .catch_edit_text import NODE_CLASS_MAPPINGS as catch_edit_mappings, NODE_DISPLAY_NAME_MAPPINGS as catch_edit_display_mappings

# Import 2nd node
from .preview_image_base64 import NODE_CLASS_MAPPINGS as preview_b64_mappings, NODE_DISPLAY_NAME_MAPPINGS as preview_b64_display_mappings

# Import umhanft nodes
from .umhanft_logic import NODE_CLASS_MAPPINGS as umhanft_mappings, NODE_DISPLAY_NAME_MAPPINGS as umhanft_display_mappings

# Import txt2combo
from .txt2combo import NODE_CLASS_MAPPINGS as txt2combo_mappings, NODE_DISPLAY_NAME_MAPPINGS as txt2combo_display_mappings

# Location of Javascript files
WEB_DIRECTORY = "./js"

# --- Structure for Merging Mappings ---
ALL_NODE_CLASS_MAPPINGS = {}
ALL_NODE_DISPLAY_NAME_MAPPINGS = {}

# Update with mappings from catch_edit_text
ALL_NODE_CLASS_MAPPINGS.update(catch_edit_mappings)
ALL_NODE_DISPLAY_NAME_MAPPINGS.update(catch_edit_display_mappings)

# Update with mappings from preview_image_base64
ALL_NODE_CLASS_MAPPINGS.update(preview_b64_mappings)
ALL_NODE_DISPLAY_NAME_MAPPINGS.update(preview_b64_display_mappings)

# Update with mappings from umhanft_logic
ALL_NODE_CLASS_MAPPINGS.update(umhanft_mappings)
ALL_NODE_DISPLAY_NAME_MAPPINGS.update(umhanft_display_mappings)

# Update with mappings from txt2combo
ALL_NODE_CLASS_MAPPINGS.update(txt2combo_mappings)
ALL_NODE_DISPLAY_NAME_MAPPINGS.update(txt2combo_display_mappings)

__all__ = ['ALL_NODE_CLASS_MAPPINGS', 'ALL_NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

# Use the final merged dict names
NODE_CLASS_MAPPINGS = ALL_NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS = ALL_NODE_DISPLAY_NAME_MAPPINGS

# UPDATED print statement
print("### Loading Custom Nodes: IMGNR/Utils Pack (CatchEditText, PreviewImage, UMHANFT, Txt2Combo)")