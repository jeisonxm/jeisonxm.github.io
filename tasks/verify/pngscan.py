import zlib, struct, sys

def read_png(path):
    d=open(path,'rb').read(); assert d[:8]==b'\x89PNG\r\n\x1a\n'
    i=8; idat=b''; w=h=bd=ct=None
    while i<len(d):
        ln=struct.unpack('>I',d[i:i+4])[0]; typ=d[i+4:i+8]; data=d[i+8:i+8+ln]; i+=12+ln
        if typ==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',data[:10])
        elif typ==b'IDAT': idat+=data
        elif typ==b'IEND': break
    raw=zlib.decompress(idat)
    ch={0:1,2:3,3:1,4:2,6:4}[ct]; bpp=ch*bd//8; stride=w*bpp
    out=bytearray(h*stride); prev=bytearray(stride); p=0
    for y in range(h):
        f=raw[p]; p+=1; line=bytearray(raw[p:p+stride]); p+=stride
        if f==1:
            for x in range(bpp,stride): line[x]=(line[x]+line[x-bpp])&255
        elif f==2:
            for x in range(stride): line[x]=(line[x]+prev[x])&255
        elif f==3:
            for x in range(stride):
                a=line[x-bpp] if x>=bpp else 0
                line[x]=(line[x]+((a+prev[x])>>1))&255
        elif f==4:
            for x in range(stride):
                a=line[x-bpp] if x>=bpp else 0
                b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
                pp=a+b-c; pa=abs(pp-a); pb=abs(pp-b); pc=abs(pp-c)
                pr=a if (pa<=pb and pa<=pc) else (b if pb<=pc else c)
                line[x]=(line[x]+pr)&255
        out[y*stride:(y+1)*stride]=line; prev=line
    return w,h,bpp,bytes(out)

def scan(path, row):
    w,h,bpp,px=read_png(path)
    stride=w*bpp; lum=[]
    for x in range(w):
        o=row*stride+x*bpp
        r,g,b=px[o],px[o+1],px[o+2]
        lum.append(0.2126*r+0.7152*g+0.0722*b)
    # mayor salto entre pixeles contiguos
    jumps=sorted(((abs(lum[x+1]-lum[x]),x) for x in range(w-1)),reverse=True)
    return w,lum,jumps[:6]

for path in sys.argv[1:]:
    w,lum,jumps=scan(path,200)
    print(path.split('/')[-1])
    print('  saltos de luminancia mas grandes (fila y=200):',
          ', '.join('x=%d  d=%.1f'%(x,dv) for dv,x in jumps))
