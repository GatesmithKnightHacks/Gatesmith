"""Convert Paper exports (Display P3) to sRGB in place so they compare with browser screenshots.
Files already in sRGB are left alone.  usage: python3 scripts/srgb.py file.png [...]"""
import io
import sys

from PIL import Image, ImageCms

SRGB = ImageCms.createProfile("sRGB")

for path in sys.argv[1:]:
    im = Image.open(path)
    icc = im.info.get("icc_profile")
    if not icc:
        continue
    src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
    if ImageCms.getProfileDescription(src).strip().lower().startswith("srgb"):
        continue
    out = ImageCms.profileToProfile(im.convert("RGB"), src, SRGB, outputMode="RGB")
    out.info.pop("icc_profile", None)
    out.save(path)
    print(f"converted {path.split('/')[-1]} to sRGB")
