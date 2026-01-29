# IMGNR-Utils/UMHANFT
# Fixes: Settings to general settings file IMGNR_settings.js
# Fixes: text match search for missing nodes; debug mode
# =========================================================
# FEATURE: Dynamic Node alternative search

import json, os, nodes, folder_paths, inspect, re
from server import PromptServer
from aiohttp import web

class UMHANFT_Logic:
    def __init__(self):
        self.base_db_path = os.path.join(os.path.dirname(__file__), "node_signatures_base.json")
        
        # Use ComfyUI's official base_path
        base_path = getattr(folder_paths, "base_path", os.path.dirname(folder_paths.__file__))
        self.user_db_path = os.path.join(base_path, "user", "umhanft_signatures.json")
        
        try: os.makedirs(os.path.dirname(self.user_db_path), exist_ok=True)
        except: pass

        self.signatures = {}
        if os.path.exists(self.user_db_path):
            self.signatures = self.load_combined_db()
        
        self.sync_check()

    def sync_check(self):
        live_count = len(nodes.NODE_CLASS_MAPPINGS)
        db_count = len(self.signatures)
        if live_count != db_count:
            print(f"### [UMHANFT] DB Sync Needed (Live: {live_count} vs DB: {db_count}). Scanning...")
            self.scan_all()
        else:
            print(f"### [UMHANFT] Database loaded and synced ({db_count} nodes).")

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
                
                input_types = []
                for v in required_inputs.values():
                    raw_type = v[0] if isinstance(v, tuple) else v
                    if isinstance(raw_type, list):
                        input_types.append("COMBO")
                    else:
                        input_types.append(str(raw_type))

                output_types = [str(t) for t in getattr(cls_obj, "RETURN_TYPES", [])]
                snr_name = getattr(cls_obj, "DESCRIPTION", name) 
                
                user_scan[name] = {
                    "input_types": input_types, 
                    "output_types": output_types,
                    "snr": str(snr_name)
                }
            except: continue
        
        try:
            with open(self.user_db_path, 'w', encoding='utf-8') as f:
                json.dump(user_scan, f, indent=2)
            self.signatures = self.load_combined_db()
        except Exception as e:
            print(f"### [UMHANFT] Error writing DB to {self.user_db_path}: {e}")

    def extract_tokens(self, text):
        if not text: return set()
        text = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', str(text)) 
        text = re.sub(r'[^a-zA-Z0-9]', ' ', text)
        return {w.lower() for w in text.split() if len(w) >= 3}

    def find_alternatives(self, target_node_type, target_title=None, neighbors=None, live_sig=None, strict=True, min_score=50, max_alts=15, strict_connected=False, debug_enabled=False, debug_filter=""):
        
        if len(self.signatures) != len(nodes.NODE_CLASS_MAPPINGS):
            self.scan_all()

        target_sig = self.signatures.get(target_node_type)
        if not target_sig and live_sig:
            clean_live_inputs = [str(t) for t in live_sig.get("input_types", [])]
            target_sig = {
                "input_types": clean_live_inputs,
                "output_types": live_sig.get("output_types", []),
                "snr": target_title or target_node_type
            }

        if not target_sig: return []

        raw_candidates = []
        
        target_out = set(self.ensure_hashable(target_sig.get("output_types", [])))
        target_in = set(self.ensure_hashable(target_sig.get("input_types", [])))
        
        target_snr = str(target_sig.get("snr", ""))
        raw_target_text = f"{target_title or ''} {target_node_type} {target_snr}"
        target_tokens = self.extract_tokens(raw_target_text)

        req_in = set(self.ensure_hashable(neighbors.get("required_inputs", []))) if neighbors else set()
        prov_out = set(self.ensure_hashable(neighbors.get("provided_outputs", []))) if neighbors else set()

        if debug_enabled:
            print(f"\n[UMHANFT] --- DEBUG SEARCH: {target_node_type} ---")
            print(f"Settings -> Strict: {strict} | Connected: {strict_connected} | Min: {min_score}")
            if debug_filter:
                print(f"Debug Filter Active: Only showing logs for '{debug_filter}'")

        for name, sig in self.signatures.items():
            if name == target_node_type: continue
            if name not in nodes.NODE_CLASS_MAPPINGS: continue
            
            sig_out = set(self.ensure_hashable(sig.get("output_types", [])))
            sig_in = set(self.ensure_hashable(sig.get("input_types", [])))

            # Debug Trigger for specific node
            should_debug_this = debug_enabled and debug_filter and (debug_filter.lower() in name.lower())

            # Strict Logic
            passed_strict = True
            if strict:
                if target_in and not target_in.issubset(sig_in): passed_strict = False
                if target_out and not target_out.issubset(sig_out): passed_strict = False
            
            if strict_connected:
                if req_in and not req_in.issubset(sig_out): passed_strict = False
                if prov_out and not prov_out.issubset(sig_in): passed_strict = False

            # Scoring
            score = 0
            disp_name = nodes.NODE_DISPLAY_NAME_MAPPINGS.get(name, name)
            
            candidate_tokens = self.extract_tokens(f"{disp_name} {name}")
            common_tokens = target_tokens.intersection(candidate_tokens)
            
            name_score = 0
            if common_tokens:
                name_score = 30 + (len(common_tokens) * 20)
                score += name_score

            unique_types = {"MODEL", "LATENT", "VAE", "CLIP", "CONDITIONING", "CONTROL_NET", "IMAGE", "MASK", "AUDIO"}
            matched_unique = (target_in & sig_in & unique_types) | (target_out & sig_out & unique_types)
            
            if matched_unique: score += 50 

            # Junk Filter
            if name_score == 0 and not matched_unique:
                if should_debug_this:
                    print(f"   [REJECT] {name}: No Name Match & No Unique Type")
                continue

            standard_types = {"STRING", "FLOAT", "INT", "BOOLEAN", "COMBO"}
            matched_standard = (target_in & sig_in & standard_types) | (target_out & sig_out & standard_types)
            
            if matched_standard:
                if name_score > 0 or matched_unique: score += 15
                else: score -= 10 

            if target_out and target_out.issubset(sig_out): score += 30
            if target_in and target_in.issubset(sig_in): score += 20
            
            if neighbors:
                if req_in.intersection(sig_out): score += 25
                if prov_out.intersection(sig_in): score += 25

            if should_debug_this:
                print(f"   >>> EVAL: {name}")
                print(f"       Passed Strict? {passed_strict} | Raw Score: {score}")
                print(f"       Tokens Shared: {common_tokens}")

            if not passed_strict: continue

            if score > 0:
                raw_candidates.append({
                    "name": name,
                    "display": disp_name,
                    "pack": self.get_pack_name(name),
                    "raw_score": score,
                    "raw_name": disp_name.lower()
                })

        # --- NORMALIZE SCALING (0-100) ---
        if not raw_candidates: return []

        max_score = max(c["raw_score"] for c in raw_candidates)
        
        final_results = []
        for c in raw_candidates:
            # Scale relative to winner
            relative_score = (c["raw_score"] / max_score) * 100
            
            if relative_score >= min_score:
                final_results.append({
                    "name": c["name"],
                    "display": f"{c['display']} {c['pack']}",
                    "score": int(relative_score),
                    "raw_score": c["raw_score"],
                    "raw_name": c["raw_name"]
                })

        final_results.sort(key=lambda x: (-x["raw_score"], x["raw_name"]))

        if debug_enabled and not debug_filter:
            print(f"[UMHANFT] Max Raw Score: {max_score}")
            print("Top 3 Candidates:")
            for r in final_results[:3]:
                print(f"   -> {r['display']} (Rel: {r['score']}%)")

        return final_results[:max_alts]

logic_instance = UMHANFT_Logic()

@PromptServer.instance.routes.post("/umhanft/find_alternatives")
async def find_alt_handler(request):
    data = await request.json()
    node_type = data.get("node_type")
    
    alts = logic_instance.find_alternatives(
        node_type, 
        data.get("node_title"), 
        data.get("neighbors"), 
        data.get("live_sig"),
        strict=data.get("strict", False),
        min_score=data.get("min_score", 50),
        max_alts=data.get("max_alts", 15),
        strict_connected=data.get("strict_connected", False),
        debug_enabled=data.get("debug_enabled", False),
        debug_filter=data.get("debug_node_text", "")
    )
    return web.json_response({"alternatives": alts, "current_pack": logic_instance.get_pack_name(node_type), "count": len(alts)})

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}