# Upload this project to GitHub

Follow these steps from your computer (Git must be installed).

## 1. Create a new repository on GitHub

1. Go to [github.com](https://github.com) and sign in.
2. Click **New** (or the **+** menu → **New repository**).
3. Choose a name (e.g. `transport-planner`).
4. Leave it **empty** (no README, .gitignore, or license).
5. Click **Create repository**.

## 2. Run these commands in your project folder

Open PowerShell or Command Prompt, then:

```powershell
cd "c:\Users\jamie\OneDrive\Desktop\Website\transport-planner-master"
```

**If this folder is not yet a git repo:**

```powershell
git init
git add .
git commit -m "Initial commit: Transport Planner with light/dark theme"
```

**If it is already a git repo**, just ensure everything is committed:

```powershell
git add .
git status
git commit -m "Transport Planner with light/dark theme"   # only if there are changes
```

**Add GitHub as remote and push** (replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and repo name):

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

Example if your username is `jdoe` and repo is `transport-planner`:

```powershell
git remote add origin https://github.com/jdoe/transport-planner.git
git branch -M main
git push -u origin main
```

Done. Your code will be on GitHub at `https://github.com/YOUR_USERNAME/YOUR_REPO`.

---

## Log in to GitHub when pushing

When the script (or `git push`) runs, Git will ask you to sign in. **GitHub no longer accepts your account password** for push—you must use a **Personal Access Token (PAT)**.

### Option A: Browser sign-in (easiest if Git Credential Manager is installed)

1. Run **`push-to-github.cmd`** (or `git push -u origin main` in the project folder).
2. When Git asks for credentials, a **browser window** may open.
3. Sign in to GitHub in the browser and approve access.
4. After that, Git will remember you for future pushes.

### Option B: Create a Personal Access Token (if Git asks for username/password in the terminal)

1. In your browser, go to **GitHub** and sign in.
2. Click your **profile picture** (top right) → **Settings**.
3. In the left sidebar, scroll to **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
4. Click **Generate new token** → **Generate new token (classic)**.
5. Name it (e.g. `Transport Planner`), choose an expiry (e.g. 90 days or No expiration).
6. Under **Scopes**, check **repo** (full control of private repositories).
7. Click **Generate token**, then **copy the token** (you won’t see it again).
8. When you run **`push-to-github.cmd`** and Git asks for:
   - **Username:** type `Justlags18`
   - **Password:** paste the **token** (not your GitHub password).

Git will store the token so you don’t have to paste it every time.
