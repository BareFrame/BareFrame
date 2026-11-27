import os, struct, zlib, math

out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
os.makedirs(out_dir, exist_ok=True)

def make_png(size):
    rows = []
    half = size / 2.0
    r_corner = size * 0.22

    def in_tri(px, py, ax, ay, bx, by, cx, cy):
        d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
        d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
        d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
        return not (((d1 < 0) or (d2 < 0) or (d3 < 0)) and ((d1 > 0) or (d2 > 0) or (d3 > 0)))

    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            dx = max(abs(x + 0.5 - half) - (half - r_corner - 1), 0.0)
            dy = max(abs(y + 0.5 - half) - (half - r_corner - 1), 0.0)
            dist = math.hypot(dx, dy) - r_corner
            if dist > 0.8:
                row.extend((0, 0, 0, 0))
                continue
            alpha = 255 if dist < -0.5 else int(max(0, min(255, (0.8 - dist) / 1.3 * 255)))
            nx, ny = x / size, y / size
            cr = int(12 + 12 * (1 - ny))
            cg = int(16 + 10 * (1 - ny))
            cb = int(25 + 16 * (1 - ny))

            if -size * 0.045 < dist < -size * 0.005:
                cr, cg, cb = 255, 70, 85

            in_bolt = (
                in_tri(nx, ny, 0.56, 0.14, 0.24, 0.54, 0.52, 0.54)
                or in_tri(nx, ny, 0.44, 0.86, 0.76, 0.46, 0.48, 0.46)
                or (0.45 <= nx <= 0.55 and 0.46 <= ny <= 0.54)
            )
            if in_bolt:
                cr = 255
                cg = int(70 + 60 * ny)
                cb = int(85 + 35 * ny)

            row.extend((cr, cg, cb, alpha))
        rows.append(bytes(row))

    raw = b"".join(rows)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

png256 = make_png(256)
with open(os.path.join(out_dir, "icon.png"), "wb") as f:
    f.write(png256)

sizes = [256, 64, 48, 32, 16]
pngs = [png256 if s == 256 else make_png(s) for s in sizes]
header = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
entries = []
for s, data in zip(sizes, pngs):
    w = 0 if s == 256 else s
    entries.append(struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(data), offset))
    offset += len(data)
with open(os.path.join(out_dir, "icon.ico"), "wb") as f:
    f.write(header + b"".join(entries) + b"".join(pngs))

print("GENERATED_ICONS_OK", len(png256))
