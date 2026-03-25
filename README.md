# Xteink X4 wallpaper maker

Small static web app to crop and resize images for the Xteink X4 e-reader, with a device-shaped preview. **Portrait 480×800** or **landscape 800×480**. Export is **24-bit uncompressed BMP** only. Everything runs in the browser; no images are uploaded to any server.

## Usage

1. Open `index.html` in a modern browser (double-click, or use a local / hosted URL).
2. Add images, adjust fit, scale, pan (sliders or drag on the preview), and optional grayscale + dither.
3. Click **Download BMP** and copy the file to your device.

## Repository layout

| File         | Role                               |
| ------------ | ----------------------------------- |
| `index.html` | Page structure                        |
| `style.css`  | Layout and UI                         |
| `app.js`     | Canvas compositing and BMP encoder    |

## Publish online (GitHub + Cloudflare Pages)

Step-by-step settings (including Cloudflare build configuration) are in **[DEPLOY.md](./DEPLOY.md)**.

## License

MIT — see [LICENSE](./LICENSE).
