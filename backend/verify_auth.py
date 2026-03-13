import sys
import os
sys.path.append(os.path.abspath('.'))
try:
    from api.routes import auth
    print("Successfully imported auth")
    print(f"Users: {list(auth._users.keys())}")
    import hashlib
    h = hashlib.sha256(b"patient123").hexdigest()
    print(f"Hash: {h}")
    # Verify patient user
    patient = auth._users.get("patient")
    print(f"Patient user: {patient}")
except Exception as e:
    print(f"Error: {e}")
