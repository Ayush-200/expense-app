# Splitwise Clone - Backend API

RESTful API for expense sharing application built with Express.js, TypeScript, PostgreSQL, and Prisma.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT
- **Validation**: Zod

## Features

✅ User registration with validation
✅ JWT-based authentication
✅ Protected routes with middleware
✅ Password hashing with bcrypt
✅ PostgreSQL database with Prisma ORM
✅ Error handling
✅ CORS enabled
✅ TypeScript strict mode

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   └── env.ts
│   ├── controllers/
│   │   └── auth.controller.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── routes/
│   │   ├── index.ts
│   │   └── auth.routes.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── jwt.ts
│   ├── validations/
│   │   └── auth.validation.ts
│   └── server.ts
├── .env.example
├── package.json
└── tsconfig.json
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://username:password@localhost:5432/splitwise_clone?schema=public"
JWT_SECRET="your-secret-key-here"
JWT_EXPIRES_IN="7d"
FRONTEND_URL="http://localhost:5173"
```

Generate JWT secret:
```bash
openssl rand -base64 32
```

### 3. Setup Database

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Server runs on `http://localhost:5000`

## API Endpoints

### Public Routes

**Health Check**
```
GET /api/health
```

**Register User**
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Login**
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Protected Routes

**Get Profile** (requires JWT token)
```
GET /api/auth/profile
Authorization: Bearer <token>
```

## Seed Users

| Name  | Email               | Password    |
|-------|---------------------|-------------|
| Aisha | aisha@example.com   | password123 |
| Rohan | rohan@example.com   | password123 |
| Priya | priya@example.com   | password123 |
| Meera | meera@example.com   | password123 |
| Dev   | dev@example.com     | password123 |
| Sam   | sam@example.com     | password123 |

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run migrations
- `npm run prisma:seed` - Seed database
- `npm run prisma:studio` - Open Prisma Studio

## Authentication Flow

1. User registers or logs in
2. Server returns JWT token
3. Frontend stores token (localStorage/cookies)
4. Frontend sends token in Authorization header for protected routes
5. Backend middleware validates token and attaches user to request

## Error Handling

All errors return JSON:
```json
{
  "message": "Error message",
  "errors": [] // Optional validation errors
}
```

Status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 404: Not Found
- 500: Internal Server Error
