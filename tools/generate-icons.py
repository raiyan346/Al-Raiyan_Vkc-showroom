"""Generate code-native PWA store icons; no external image dependency."""
from pathlib import Path
import zlib, struct
def icon(size):
    pixels=[]
    for y in range(size):
        row=bytearray()
        for x in range(size):
            u,v=x/size,y/size
            color=(9,45,145)
            if .23<v<.40 and .20-(v-.23)*.15<u<.80+(v-.23)*.15: color=(255,171,8)
            if (.27<u<.73 and .43<v<.78 and (u<.31 or u>.69 or v>.74)) or (.42<u<.58 and .54<v<.77 and (u<.46 or u>.54 or v<.58)): color=(255,255,255)
            row.extend((*color,255))
        pixels.append(b'\x00'+row)
    def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(pixels)))+chunk(b'IEND',b'')
for size in (192,512):
    Path(f'client/public/icon-{size}.png').write_bytes(icon(size))
