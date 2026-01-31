# Backend

**Run the backend from this folder.** From the repo root: `cd backend` then `npm run dev`. If you see "Cannot find module 'jsonwebtoken'", you're in the wrong directory—start from `backend`.

## Prisma (SQLite)

1. Set in `.env`:
   - `DATABASE_URL="file:./prisma/dev.db"`
   - `JWT_SECRET="your-secret-key"` (required for auth; use a long random string in production)
2. Install deps: `npm install`
3. Generate client: `npx prisma generate`
4. Create/update DB schema: `npx prisma migrate dev`
5. Seed initial staff user: `npm run seed` (creates jamie@pml-ltd.com / Password123, Developer, must change password on first login)
