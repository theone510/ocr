<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1drxfW5rJNH9OKZBvquQgWkQFCz4ZHgdY

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a `.env.local` file with your keys:
   ```
   GEMINI_API_KEY=your-gemini-api-key

   # Optional: enables Google sign-in, cloud sync and the public library
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
   (`VITE_GEMINI_API_KEY` is also accepted instead of `GEMINI_API_KEY`.)
3. Run the app:
   `npm run dev`
4. Type-check and build for production:
   `npm run typecheck && npm run build`
