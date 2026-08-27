"""Stage B: upscale alpha to full res, composite with full-res RGB, write RGBA PNG."""
import os, sys, time
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
SRC, ALPHA, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
for fn in sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpg",".jpeg"))):
    base = fn[:-4].replace(".jpg","")
    ap = os.path.join(ALPHA, base + ".alpha.png")
    if not os.path.exists(ap): print("MISSING", ap); continue
    rgb = Image.open(os.path.join(SRC, fn)).convert("RGB")
    a = Image.open(ap).convert("L").resize(rgb.size, Image.LANCZOS)
    rgba = rgb.copy(); rgba.putalpha(a)
    p = os.path.join(OUT, base + ".png")
    t=time.time(); rgba.save(p, optimize=True); 
    print(f"{base[:46]:46s} {rgba.size} PNG={os.path.getsize(p)/1048576:6.2f}MB ({time.time()-t:.1f}s)", flush=True)
