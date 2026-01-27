# transport-planner

Transport Planner is a small planning app for organizing routes, stops, and schedules.
It includes a backend API and a web frontend.

## Local development

Backend:
- `cd backend`
- `npm install`
- `npm run dev`

Frontend:
- `cd frontend`
- `npm install`
- `npm run dev`

## Environment variables

Create `.env` files in `backend/` and `frontend/` as needed. Typical values:
- `PORT` - local port for each service
- `DATABASE_URL` - backend database connection string
- `API_BASE_URL` - frontend URL to reach the backend

## Deployment notes

Target deployment: Hetzner with Docker. Plan is to add Dockerfiles for both services
and a `docker-compose.yml` (or similar), with secrets managed via Hetzner and
environment variables at deploy time.
