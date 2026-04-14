# App Icons

Place platform-specific icons here for electron-builder:

- `icon.icns` — macOS (1024x1024, can generate from PNG using `iconutil` or `electron-icon-builder`)
- `icon.ico` — Windows (256x256 multi-size ICO)
- `icon.png` — Linux (512x512 or 1024x1024 PNG)

## Generate from source PNG

```bash
# Copy the source icon
cp ../../src/ui/shards_icon.png icon.png

# macOS .icns (requires macOS + iconutil)
mkdir icon.iconset
for size in 16 32 64 128 256 512 1024; do
  sips -z $size $size icon.png --out icon.iconset/icon_${size}x${size}.png
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset

# Windows .ico (requires ImageMagick)
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

Or use `electron-icon-builder`:
```bash
npx electron-icon-builder --input=icon.png --output=.
```
