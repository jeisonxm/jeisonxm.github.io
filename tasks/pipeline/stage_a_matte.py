"""Stage A: BiRefNet matte at low memory. Emits an 8-bit grayscale alpha PNG."""
import time, os, sys, resource
import onnxruntime as ort
_orig = ort.InferenceSession
def patched(*a, **kw):
    so = ort.SessionOptions()
    so.enable_cpu_mem_arena = False      # <-- without this, RSS hits ~6.4GB and the process is killed
    so.enable_mem_pattern = False
    so.intra_op_num_threads = 2
    kw["sess_options"] = so
    return _orig(*a, **kw)
ort.InferenceSession = patched
from PIL import Image
from rembg import new_session, remove
Image.MAX_IMAGE_PIXELS = None

SRC, OUT, MODEL, WORK_H = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
os.makedirs(OUT, exist_ok=True)
sess = new_session(MODEL)
files = sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpg",".jpeg",".png")))
T0 = time.time()
for fn in files:
    im = Image.open(os.path.join(SRC, fn)).convert("RGB")
    W0, H0 = im.size
    small = im.resize((max(1, round(W0*WORK_H/H0)), WORK_H), Image.LANCZOS)
    im.close()
    t = time.time()
    cut = remove(small, session=sess, post_process_mask=False)
    dt = time.time()-t
    base = fn[:-4].replace(".jpg","")
    p = os.path.join(OUT, base + ".alpha.png")
    cut.getchannel("A").save(p, optimize=True)
    print(f"{base[:46]:46s} src={W0}x{H0} work={small.size} {dt:6.1f}s alpha={os.path.getsize(p)/1024:6.1f}KB", flush=True)
print(f"TOTAL {len(files)} imgs {time.time()-T0:.1f}s  peakRSS={resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1048576:.2f}GB", flush=True)
