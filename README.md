# Cape Ann Nor'easters — Football Squares

Static site (no build tools). Includes:
- Multi-board manager (create/switch/delete)
- Read-only viewer mode: add `?view=1` to the URL
- Venmo integration (defaults to @NoreastersFlagFB)
- Admin lock (simple password stored as a hash)
- CSV export
- Theme color picker
- Local-only storage + Export/Import JSON

## GitHub Pages Deployment

1. Create the repo **capeannnoreasters-ops** on GitHub (public is fine).
2. Upload the **contents** of this folder (keep `index.html` at the root). Include the `assets/` and `.nojekyll` file.
   - Alternatively, run:
     ```bash
     git init
     git remote add origin https://github.com/<YOUR-USER>/capeannnoreasters-ops.git
     git add .
     git commit -m "Initial commit: football squares"
     git branch -M main
     git push -u origin main
     ```
3. In the GitHub repo: **Settings → Pages** → Set Source to **Deploy from Branch**, branch `main`, folder `/ (root)` → **Save**.
4. Your site will be live at: `https://<YOUR-USER>.github.io/capeannnoreasters-ops/`

## Read-only link
Once live, append `?view=1` to share a non-editable viewer page.

## Admin lock
In the app, set a password in **Setup → Optional Admin Lock**. This prevents edits on shared devices (stored as a hash in localStorage; not meant as high security).

## Logo replacements

Replace `assets/logo-full.png` and `assets/logo-wordmark.png` with updated images using the same filenames to rebrand.
