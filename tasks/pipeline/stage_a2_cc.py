"""Stage A2: keep only the largest connected component of the matte; fill interior holes."""
import os,sys
import numpy as np
from PIL import Image
from scipy import ndimage
Image.MAX_IMAGE_PIXELS=None
IN,OUT=sys.argv[1],sys.argv[2]
os.makedirs(OUT,exist_ok=True)
for f in sorted(x for x in os.listdir(IN) if x.endswith(".alpha.png")):
    a=np.array(Image.open(os.path.join(IN,f)).convert("L"))
    m=a>96
    lab,n=ndimage.label(m)
    if n>1:
        sizes=ndimage.sum(m,lab,range(1,n+1))
        keep=(np.argmax(sizes)+1)
        big=(lab==keep)
    else:
        big=m
    filled=ndimage.binary_fill_holes(big)
    holes=int(filled.sum()-big.sum())
    # dilate the keep-mask slightly so the soft edge band survives the gating
    gate=ndimage.binary_dilation(filled, iterations=3)
    out=np.where(gate, a, 0).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(OUT,f),optimize=True)
    print(f"{f[:44]:44s} comps={n} removed={int(m.sum()-big.sum()):6d}px holesFilled={holes:5d}")
