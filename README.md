<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1-ft3jAPllCaQ4oDvr40B50tAFR97iRX0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `VITE_GEMINI_PRIMARY_API_KEY` in [.env.local](.env.local) to your Gemini API key
   (fallbacks supported in code: `VITE_GEMINI_API_KEY`, `VITE_API_KEY`, `GEMINI_PRIMARY_API_KEY`, `GEMINI_API_KEY`, `API_KEY`)
3. Run the app:
   `npm run dev`
