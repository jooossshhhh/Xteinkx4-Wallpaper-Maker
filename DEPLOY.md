# Deploy: GitHub + Cloudflare Pages

This site is **static files only** (no build step). Cloudflare serves `index.html` from the **root** of the repository.

## Before you start — files to check (optional)

| Item | Required? |
| ---- | --------- |
| **App code** (`index.html`, `app.js`, `style.css`) | No changes needed for Cloudflare. Links are relative. |
| **`LICENSE`** | Optional: put your name in the copyright line. |
| **Repo visibility** | Public repo is typical; Cloudflare can deploy private repos too (on your account). |

You do **not** need to edit URLs, API keys, or `base` paths for a normal `*.pages.dev` deploy at the site root.

---

## Part 1 — Get the project on GitHub

### Option A — GitHub Desktop (easiest if you avoid the terminal)

1. Install [GitHub Desktop](https://desktop.github.com/).
2. **File → Add Local Repository** → choose the `xteink4-wallpapers` folder (or **create** the repo from your folder).
3. Commit all files, then **Publish repository** to GitHub (pick owner, name, public/private).

### Option B — Git in a terminal

1. Install [Git for Windows](https://git-scm.com/download/win).
2. In the project folder:

```powershell
cd C:\Users\jpsmi\xteink4-wallpapers
git init
git add .
git commit -m "Initial commit: Xteink X4 wallpaper maker"
```

3. On [github.com](https://github.com): **New repository** (empty, no README).
4. Link and push (replace `YOUR_USER` and `YOUR_REPO`):

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

---

## Part 2 — Connect Cloudflare Pages to GitHub

1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com/) (free account is fine).
2. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Authorize **GitHub** and select the repository you just created.
4. **Set up build** — for this project use:

| Setting | Value |
| --------| ----- |
| **Framework preset** | None |
| **Build command** | *(leave empty)* |
| **Build output directory** | `/` |

   Some dashboards accept `.` instead of `/` for “root”; if deploy fails, try **`.`** as the output directory.

5. **Save and Deploy**.

After the first deploy, Cloudflare shows your live URL, usually:

**`https://<project-name>.pages.dev`**

You can rename the project under **Settings** if you want a nicer hostname.

---

## Part 3 — After each change

Push commits to the **production branch** (usually `main`). Cloudflare will **redeploy automatically** unless you turned that off.

---

## Troubleshooting

| Problem | What to try |
| --------| ------------ |
| 404 or blank site | Confirm **build output directory** is root (`/` or `.`) and `index.html` is at the repo root. |
| Old version in browser | Hard refresh (Ctrl+F5) or wait a minute for CDN cache. |
| `pages.dev` DNS error right after first deploy | Wait a few minutes and retry; DNS can lag. |

---

## Alternative: deploy without Git on Cloudflare

If you prefer not to use Git integration, Cloudflare supports **Direct Upload** (zip / CLI). Git integration is usually simpler for ongoing updates.
