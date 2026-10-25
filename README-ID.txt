Nto.presett Web Patcher — Vercel website

UPLOAD:
1. Extract this ZIP on your phone/computer.
2. Open https://vercel.com and sign in.
3. Choose Add New -> Project (or Deploy Project).
4. If prompted to import a Git repository, easiest alternative is use Vercel CLI from a computer, or upload the folder through a supported deployment flow. Vercel dashboard deployment options can vary.
5. Deploy the folder as a static site; no build command is required. Output/root directory should be this folder.
6. Open the generated *.vercel.app URL.

FILES:
- index.html: website UI
- app.js: video processing client
- ui-background.mp4 and icons/: assets

IMPORTANT LIMITATIONS:
- A website cannot run the browser-extension injection hooks from page-hook.js / tiktok-wm.js, nor automatically patch TikTok upload metadata. That functionality requires installing the extension in a supported browser.
- Video processing calls https://api.kuronaiapp.com. The API must allow CORS requests from your Vercel domain and support Range downloads. If browser console reports CORS/network errors, server-side API configuration is required; deploying the website alone cannot fix it.
- The original extension has been converted to the website UI and video-processing flow only.
