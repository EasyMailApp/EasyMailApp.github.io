# Job Application Assistant Web

This project was converted from a Chrome extension into a React website that can be hosted on GitHub Pages.

## What changed

- Built with `React + Vite`
- Data is stored in browser `localStorage`
- Jobs, profile, API keys, resume name, and app settings persist after closing the tab
- Gmail sending now uses Google Identity Services for a normal website

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

1. Create a GitHub repository for this folder.
2. Push the code to the `main` branch.
3. Run:

```bash
npm run deploy
```

This publishes the `dist` folder to the `gh-pages` branch.

## GitHub Pages settings

In GitHub:

1. Open `Settings`
2. Open `Pages`
3. Set the source to `Deploy from a branch`
4. Select branch `gh-pages`
5. Save

## Google OAuth setup for Gmail sending

Because this is now a website, your Google OAuth app must be a **Web application**.

In Google Cloud Console:

1. Open your OAuth client
2. Add your GitHub Pages URL to **Authorized JavaScript origins**
3. Example:

```text
https://yourusername.github.io
```

If you host this app under a repository path, the origin still stays the domain only.

You can also paste a different web client ID into the app Settings screen.

## Notes

- `localStorage` keeps the data after tab close and revisit on the same browser/device.
- Auto-processing only runs while the site is open in the browser.
- If you clear browser storage manually, the saved data will be removed.
