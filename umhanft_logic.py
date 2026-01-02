import json, os, nodes, folder_paths, inspect
from server import PromptServer
from aiohttp import web

# GLOBAL CONFIGURATION
MAX_ALTERNATIVES = 15

class UMHANFT_Logic:
    def __init__(self):
        self.base_db_path = os.path.join(os.path.dirname(__file__), "node_signatures_base.json")
        comfy_path = os.path.dirname(folder_paths.__file__)
        self.user_db_path = os.path.join(comfy_path, "user", "umhanft_signatures.json")
        os.makedirs(os.path.dirname(self.user_db_path), exist_ok=True)
        
        # Background scan on startup
        print(f"### [UMHANFT] Starting background library scan...")
        self.scan_all()
        print(f"### [UMHANFT] Scan complete. Library indexed.")

    def load_combined_db(self):
        combined = {}
        for path in [self.base_db_path, self.user_db_path]:
            if os.path.exists(path):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        combined.update(json.load(f))
                except: continue
        return combined

    def ensure_hashable(self, data_list):
        if not data_list: return []
        return [str(i) for i in data_list]

    def get_pack_name(self, node_name):
        cls = nodes.NODE_CLASS_MAPPINGS.get(node_name)
        if not cls: return "(Missing)"
        try:
            source_file = inspect.getfile(cls)
            if "custom_nodes" in source_file:
                parts = source_file.split(os.sep)
                if "custom_nodes" in parts:
                    idx = parts.index("custom_nodes")
                    return f"({parts[idx+1]})"
            return "(Core)"
        except: return "(Core)"

    def scan_all(self):
        installed = nodes.NODE_CLASS_MAPPINGS
        user_scan = {}
        for name, cls_obj in installed.items():
            try:
                inputs_info = cls_obj.INPUT_TYPES()
                required_inputs = inputs_info.get("required", {})
                input_types = [str(v[0] if isinstance(v, tuple) else v) for v in required_inputs.values()]
                output_types = [str(t) for t in getattr(cls_obj, "RETURN_TYPES", [])]
                snr_name = getattr(cls_obj, "DESCRIPTION", name) 
                
                user_scan[name] = {
                    "input_types": input_types, 
                    "output_types": output_types,
                    "snr": str(snr_name)
                }
            except: continue
        with open(self.user_db_path, 'w', encoding='utf-8') as f:
            json.dump(user_scan, f, indent=2)
        self.signatures = self.load_combined_db()

    def find_alternatives(self, target_node_type, target_title=None, neighbors=None, live_sig=None):
        target_sig = self.signatures.get(target_node_type)
        if not target_sig and live_sig:
            target_sig = {
                "input_types": live_sig.get("input_types", []),
                "output_types": live_sig.get("output_types", []),
                "snr": target_title or target_node_type
            }

        if not target_sig: return []

        suggestions = []
        target_out = set(self.ensure_hashable(target_sig.get("output_types", [])))
        target_in = set(self.ensure_hashable(target_sig.get("input_types", [])))
        target_snr = str(target_sig.get("snr", "")).lower()

        for name, sig in self.signatures.items():
            if name == target_node_type: continue
            if name not in nodes.NODE_CLASS_MAPPINGS: continue
            
            score = 0
            sig_out = set(self.ensure_hashable(sig.get("output_types", [])))
            sig_in = set(self.ensure_hashable(sig.get("input_types", [])))

            if target_out and target_out.issubset(sig_out): score += 50
            elif not target_out and not sig_out: score += 40
            
            if target_in and target_in.issubset(sig_in): score += 20
            elif not target_in and not sig_in: score += 40

            if neighbors:
                req_in = set(self.ensure_hashable(neighbors.get("required_inputs", [])))
                prov_out = set(self.ensure_hashable(neighbors.get("provided_outputs", [])))
                if req_in.intersection(sig_out): score += 20
                if prov_out.intersection(sig_in): score += 20

            if target_snr and target_snr == str(sig.get("snr", "")).lower(): score += 35
            
            keywords = {"float", "string", "image", "save", "load", "text", "int", "bool", "number"}
            for kw in keywords:
                if kw in name.lower() and kw in target_node_type.lower(): score += 15

            if score >= 50:
                disp = nodes.NODE_DISPLAY_NAME_MAPPINGS.get(name, name)
                suggestions.append({
                    "name": name, 
                    "display": f"{disp} {self.get_pack_name(name)}", 
                    "score": int(min(score, 100)),
                    "raw_name": disp.lower()
                })

        return sorted(suggestions, key=lambda x: (-x["score"], x["raw_name"]))[:MAX_ALTERNATIVES]

logic_instance = UMHANFT_Logic()

@PromptServer.instance.routes.post("/umhanft/find_alternatives")
async def find_alt_handler(request):
    data = await request.json()
    node_type = data.get("node_type")
    alts = logic_instance.find_alternatives(node_type, data.get("node_title"), data.get("neighbors"), data.get("live_sig"))
    return web.json_response({"alternatives": alts, "current_pack": logic_instance.get_pack_name(node_type), "count": len(alts)})

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}