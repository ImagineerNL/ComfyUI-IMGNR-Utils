# IMGNR Utils / constants.py

# --- LOG Colors ---
CRED = '\033[91m'       # Red
CREDBG = '\033[41m'     # Red Background
CYELLOW = '\033[93m'    # Yellow
CGREEN = '\033[92m'     # Green
CGREENBG = '\033[42m'   # Green Background
CBLUE = '\033[94m'      # Blue
CCYAN = '\033[96m'      # Cyan
CEND = '\033[0m'        # Reset to default

# --- Standard Log Prefixes ---
# Log Prefix for Debug
# LOG_PREFIX = f"{CGREEN}[IMGNR Utils]{CEND}"
# Log Prefix for normal use
LOG_PREFIX = f"{CEND}[IMGNR Utils]{CEND}"
WARN_PREFIX = f"{CYELLOW}[IMGNR Utils]{CEND}"
ERR_PREFIX  = f"{CRED}[IMGNR Utils ERROR]{CEND}"