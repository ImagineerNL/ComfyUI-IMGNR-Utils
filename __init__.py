# IMGNR Utils /__init__.py

# Import 1st node
from .catch_edit_text import NODE_CLASS_MAPPINGS as catch_edit_mappings, NODE_DISPLAY_NAME_MAPPINGS as catch_edit_display_mappings

# Import 2nd node
from .preview_image_base64 import NODE_CLASS_MAPPINGS as preview_b64_mappings, NODE_DISPLAY_NAME_MAPPINGS as preview_b64_display_mappings

# Import umhanft nodes
from .umhanft_logic import NODE_CLASS_MAPPINGS as umhanft_mappings, NODE_DISPLAY_NAME_MAPPINGS as umhanft_display_mappings

# Import DIY Nodes
from .diy_nodes import NODE_CLASS_MAPPINGS as diynodes_mappings, NODE_DISPLAY_NAME_MAPPINGS as diynodes_display_mappings

# Import DIY Reconstructor
from .diy_reconstructor import NODE_CLASS_MAPPINGS as diyreconstructor_mappings, NODE_DISPLAY_NAME_MAPPINGS as diyreconstructor_display_mappings

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

# Update with mappings from diy_nodes
ALL_NODE_CLASS_MAPPINGS.update(diynodes_mappings)
ALL_NODE_DISPLAY_NAME_MAPPINGS.update(diynodes_display_mappings)

# Update with mappings from diy_reconstructor
ALL_NODE_CLASS_MAPPINGS.update(diyreconstructor_mappings)
ALL_NODE_DISPLAY_NAME_MAPPINGS.update(diyreconstructor_display_mappings)

__all__ = ['ALL_NODE_CLASS_MAPPINGS', 'ALL_NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

# Use the final merged dict names
NODE_CLASS_MAPPINGS = ALL_NODE_CLASS_MAPPINGS
NODE_DISPLAY_NAME_MAPPINGS = ALL_NODE_DISPLAY_NAME_MAPPINGS

# UPDATED print statement
print("\033[92m### Loading Custom Nodes: IMGNR/Utils Pack (CatchEditText, PreviewImage, UMHANFT, DIY Nodes)\033[0m")