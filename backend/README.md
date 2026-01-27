# Backend

## Prisma (SQLite)

1. Set `DATABASE_URL` in `.env`, for example:
   `DATABASE_URL="file:./dev.db"`
2. Install deps: `npm install`
3. Generate client: `npx prisma generate`
4. Create/update DB schema: `npx prisma migrate dev`
