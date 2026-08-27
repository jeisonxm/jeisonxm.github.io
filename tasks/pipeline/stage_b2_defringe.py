"""Stage B (defringed): erode the soft band from the outside, then pull edge RGB from inside the body.
   alpha' = clip((alpha - T)/(1-T)) removes the outer, most-contaminated part of the transition band.
   RGB in the remaining band is replaced by a blurred 'inside' colour so no background hue survives."""
import os,sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
Image.MAX_IMAGE_PIXELS=None
SRC,ALPHA,OUT,T = sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4])
os.makedirs(OUT,exist_ok=True)
for fn in sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpg",".jpeg"))):
    base=fn[:-4].replace(".jpg","")
    ap=os.path.join(ALPHA,base+".alpha.png")
    if not os.path.exists(ap): continue
    rgb=Image.open(os.path.join(SRC,fn)).convert("RGB")
    a=Image.open(ap).convert("L").resize(rgb.size,Image.LANCZOS)
    af=np.array(a).astype(np.float32)/255.0
    a2=np.clip((af-T)/(1.0-T),0,1)                      # erode soft band from the outside
    core=a2>0.995
    # colour decontamination: flood the body colour outward, then use it only inside the soft band
    arr=np.array(rgb).astype(np.float32)
    idx=ndimage.distance_transform_edt(~core, return_distances=False, return_indices=True)
    flooded=arr[idx[0],idx[1]]
    w=np.clip((a2-0.02)/0.93,0,1)[...,None]             # 1 in the core, ->0 at the outer edge
    clean=arr*w+flooded*(1-w)
    outarr=np.dstack([np.where(core[...,None],arr,clean),(a2*255)]).astype(np.uint8)
    p=os.path.join(OUT,base+".png")
    Image.fromarray(outarr,"RGBA").save(p,optimize=True)
    print(f"{base[:44]:44s} T={T} PNG={os.path.getsize(p)/1048576:5.2f}MB",flush=True)
