# abba_switch.py

class AnyType(str):
    DESCRIPTION = """A special class that is always equal to any string.
    This allows ComfyUI to connect any type of node output to this input."""
    def __ne__(self, __value: object) -> bool:
        return False

ANY_TYPE = AnyType("*")

class IMGNR_ABBASwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any_A": (ANY_TYPE,{"tooltip": "ANY input (same as B)"}),
                "any_B": (ANY_TYPE,{"tooltip": "ANY input (same as A)"}),
                "swap_AB_BA": ("BOOLEAN", {"default": False, "tooltip": "Swap AB - BA"})
            }
        }

    RETURN_TYPES = (ANY_TYPE, ANY_TYPE)
    RETURN_NAMES = ("Output 1", "Output 2")
    FUNCTION = "switch"
    CATEGORY = "IMGNR"

    def switch(self, any_A, any_B, swap_AB_BA):
        # Enforce type matching on the Python side
        if type(any_A) != type(any_B):
            raise TypeError(
                f"ABBA Switch: Input types do not match. "
                f"Input A is '{type(any_A).__name__}', Input B is '{type(any_B).__name__}'."
            )
        
        if swap_AB_BA:
            return (any_B, any_A)
        return (any_A, any_B)


NODE_CLASS_MAPPINGS = {
    "IMGNR_ABBASwitch": IMGNR_ABBASwitch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IMGNR_ABBASwitch": "ABBA Switch (IMGNR)"
}