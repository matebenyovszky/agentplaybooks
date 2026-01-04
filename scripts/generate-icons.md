# Icon Generation Guide

The SVG icons in `/public/` need to be converted to PNG for full browser/platform compatibility.

## Required PNG files

Generate these from the SVG sources:

1. **favicon.ico** (from `favicon.svg`)
   - 16x16, 32x32, 48x48 (multi-size ICO)

2. **icon-192.png** (from `icon.svg`)
   - 192x192 PNG for Android/Chrome

3. **icon-512.png** (from `icon.svg`)
   - 512x512 PNG for Android/Chrome  

4. **apple-icon.png** (from `apple-icon.svg`)
   - 180x180 PNG for Apple devices

5. **og-image.png** (from `og-image.svg`)
   - 1200x630 PNG for Open Graph

6. **twitter-image.png** (from `twitter-image.svg`)
   - 1200x600 PNG for Twitter cards

## Tools to convert

### Using Inkscape (CLI):
```bash
inkscape -w 192 -h 192 public/icon.svg -o public/icons/icon-192.png
inkscape -w 512 -h 512 public/icon.svg -o public/icons/icon-512.png
inkscape -w 180 -h 180 public/apple-icon.svg -o public/apple-icon.png
inkscape -w 1200 -h 630 public/og-image.svg -o public/og-image.png
inkscape -w 1200 -h 600 public/twitter-image.svg -o public/twitter-image.png
```

### Using ImageMagick:
```bash
convert -background none -resize 192x192 public/icon.svg public/icons/icon-192.png
convert -background none -resize 512x512 public/icon.svg public/icons/icon-512.png
```

### Online tools:
- https://cloudconvert.com/svg-to-png
- https://realfavicongenerator.net/ (generates all favicon variants)

## Note

Modern browsers support SVG favicons, so the SVG files will work for most users.
PNG fallbacks are only needed for older browsers and some social media platforms.

