# WraeclastLedger — Build & Publish Steps

## Step 1: Initialize git (one-time, do this first)

Open PowerShell in the project folder and run these commands one by one:

```powershell
git init
git remote add origin https://github.com/gund0lf/wraeclastledger_react.git
git branch -M main
git add .
git commit -m "initial commit"
git push -u origin main
```

If git push asks for credentials: use your GitHub username and your Classic PAT token as the password.

---

## Step 2: Publish a release (every time you want to push an update)

```powershell
$env:GH_TOKEN="your_classic_pat_token_here"
npm run publish:win
```

This single command:
1. Compiles your code (electron-vite build)
2. Packages it as an NSIS installer
3. Uploads it to GitHub Releases automatically

The first time you run this, go to https://github.com/gund0lf/wraeclastledger_react/releases
and you should see a draft release. Publish it.

---

## Step 3: Future updates

Every time you change the app and want users to get an update:
1. Bump the version in package.json (e.g. 1.0.0 → 1.0.1)
2. Run `$env:GH_TOKEN="token"; npm run publish:win`
3. Users get an automatic update notification next time they open the app

---

## GitHub token

Your Classic PAT needs the "repo" scope (full control of private repositories).
Create one at: https://github.com/settings/tokens
The "Actions secret" approach is only needed for GitHub Actions (CI/CD), not for local publishing.
Your local PowerShell approach with $env:GH_TOKEN is correct.

---

## Why NSIS installer instead of portable

electron-updater only works with installers (NSIS on Windows).
The installer goes to %AppData%\Local\Programs\WraeclastLedger — not C:\Program Files.
Users install once, then all future updates happen automatically in the background.
