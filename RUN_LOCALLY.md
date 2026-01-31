# Run the app locally

If "site cannot be reached" or the start script doesn't work, run the servers **manually** in two terminals so you can see any errors.

## First time only (install dependencies)

In **Terminal 1** (backend):
```bash
cd "c:\Users\jamie\OneDrive\Desktop\Website\transport-planner-master\backend"
npm install
npx prisma generate
npx prisma migrate dev
```

In **Terminal 2** (frontend):
```bash
cd "c:\Users\jamie\OneDrive\Desktop\Website\transport-planner-master\frontend"
npm install
```

## Start the app

**Terminal 1** – start backend (leave this running):
```bash
cd "c:\Users\jamie\OneDrive\Desktop\Website\transport-planner-master\backend"
npm run dev
```
Wait until you see: `API listening on port 3001`

**Terminal 2** – start frontend (leave this running):
```bash
cd "c:\Users\jamie\OneDrive\Desktop\Website\transport-planner-master\frontend"
npm run dev
```
Wait until you see: `Local: http://localhost:5173/`

**Browser:** Open **http://localhost:5173**

---

- If you see **"npm is not recognized"**: install Node.js from https://nodejs.org and restart the terminal.
- If a port is in use: close the other app using that port, or change the port in `backend/src/index.ts` (PORT) and `frontend/vite.config.ts` (server.port).
