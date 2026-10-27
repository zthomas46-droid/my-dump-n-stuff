# My Dump — your private swipe feed

A static, installable progressive web app for personal photos, GIFs, and videos. The website code is public if deployed on GitHub Pages, but **your imported files are not uploaded**; they stay in local IndexedDB storage on the iPhone where you import them.

## Free deployment using GitHub Pages
1. Sign into https://github.com/ and create a **new public repository**, for example `my-dump` (do not add a README during creation).
2. In the repository select **Add file → Upload files**. Unzip the package on your computer and upload **all files inside** the `private-reel-dump` directory to the repository root, including `index.html`, `.js`, `.css`, `.png`, and `.webmanifest` files. Commit changes.
3. Open **Settings → Pages**. For Source select **Deploy from a branch** and choose **main** and **/(root)**; save.
4. Open the displayed URL, normally `https://YOUR-USERNAME.github.io/my-dump/`, in **Safari on your iPhone**.
5. In Safari use **Share → Add to Home Screen**, ensure **Open as Web App** is enabled, and tap **Add**.
6. Launch **My Dump** from your Home Screen. Tap **Add**, choose photos/GIFs/videos, then swipe up/down. Tap ♡ for Favorites, Shuffle for random order, or Library for sorting/deletion.
7. After the initial app load, the app shell is cached for offline use. Media previously imported on that same installed app can be viewed offline.

## Critical storage and privacy facts
- No accounts, external APIs, trackers, uploads, or paid services. The media is stored **only within this device's app/browser site data**, and never committed to GitHub.
- GitHub Pages free hosting requires a **public** code repository. The app code can be seen publicly, but the media you import is not sent to the repository or to GitHub. Anyone knowing the link can open an **empty** copy of the app. Do not put private media into the repository.
- Local browser storage is **not a reliable sole backup**. Safari/iOS may evict web data under storage pressure, and deleting the Home Screen app or website data may lose imports. **Keep the originals in Apple Photos / Files or another backup**. There is no cloud sync or cross-device media sync.
- iPhone Safari media support depends on codecs; HEIC, some MOV variants, and certain videos may not render. Videos generally autoplay muted until unmuted. The app intentionally stores originals without recompression.
- Imported items use local disk space **in addition to** their originals. For hundreds of large videos, device storage may be inadequate. Check iPhone free space.
- Import from the final installed Home Screen app rather than first importing in a Safari tab. Browser and standalone app storage behavior can differ.
- Instagram/TikTok URLs alone aren't playable in the feed. Obtain/export a video file that you have rights to save.

## Local desktop test (optional)
From the project folder run `python -m http.server 8000`, then open `http://localhost:8000`. Production iPhone installation uses HTTPS GitHub Pages.

## Files
`index.html` UI, `style.css` design, `app.js` feed/IndexedDB logic, `sw.js` offline app shell, `manifest.webmanifest` install metadata, `icon-*.png` app icons.
