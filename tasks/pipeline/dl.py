import time, sys, os
from rembg import new_session
for m in ["isnet-general-use","u2net_human_seg","birefnet-general-lite","birefnet-portrait","u2net"]:
    t=time.time()
    try:
        s=new_session(m)
        p=s.__class__.download_models()
        print(f"OK  {m:24s} {time.time()-t:6.1f}s  {p}  {os.path.getsize(p)/1048576:.1f}MB", flush=True)
    except Exception as e:
        print(f"FAIL {m:24s} {type(e).__name__}: {str(e)[:200]}", flush=True)
