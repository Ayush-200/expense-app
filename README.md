# Splitwise Clone - Expense Sharing Application

A full-stack expense sharing application with separate frontend and backend, similar to Splitwise.

## Architecture

```
expense-app/
├── backend/          # Express.js REST API
└── frontend-app/     # React + Vite frontend
```

### Backend (Express + TypeScript + PostgreSQL)
- RESTful API with Express.js
- PostgreSQL database with Prisma ORM
- JWT-based authentication
- Bcrypt password hashing
- Zod validation
- TypeScript strict mode

### Frontend (React + TypeScript + Vite)
- React 18 with TypeScript
- Vite for fast development
- React Router for routing
- Axios for API calls
- Tailwind CSS for styling
- Context API for state management

## Features Implemented

✅ User registration with validation  
✅ User login with JWT authentication  
✅ Protected routes (both backend middleware and frontend)  
✅ Logout functionality  
✅ Database schema for users  
✅ Password hashing  
✅ Error handling  
✅ CORS configuration  
✅ Seed data for 6 users  

## Quick Start

### Prerequisites

- Node.js 18+ installed
- PostgreSQL installed and running
- Git

### 1. Clone Repository

```bash
git clone <repository-url>
cd expense-app
```

### 2. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials and JWT secret

# Setup database
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# Start backend server
npm run dev
```

Backend runs on `http://localhost:5000`

### 3. Setup Frontend

Open a new terminal:

```bash
cd frontend-app

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env if needed (default: http://localhost:5000/api)

# Start frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

### 4. Access Application

Open `http://localhost:5173` in your browser.

**Demo Login:**
- Email: `aisha@example.com`
- Password: `password123`

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Endpoints

**Health Check**
```
GET /health
```

**Register User**
```
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Login**
```
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Get Profile** (Protected)
```
GET /auth/profile
Authorization: Bearer <jwt-token>
```

## Environment Variables

### Backend (.env)
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://username:password@localhost:5432/splitwise_clone"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
FRONTEND_URL="http://localhost:5173"
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
```

## Database Schema

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  password      String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}
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

## Project Structure

### Backend
```
backend/
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Seed data
├── src/
│   ├── config/             # Configuration files
│   ├── controllers/        # Request handlers
│   ├── middleware/         # Express middleware
│   ├── routes/             # API routes
│   ├── types/              # TypeScript types
│   ├── utils/              # Helper functions
│   ├── validations/        # Zod schemas
│   └── server.ts           # Entry point
├── .env
└── package.json
```

### Frontend
```
frontend-app/
├── src/
│   ├── components/         # Reusable components
│   ├── config/             # Configuration
│   ├── context/            # React Context
│   ├── pages/              # Page components
│   ├── services/           # API services
│   ├── types/              # TypeScript types
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Entry point
├── .env
└── package.json
```

## Authentication Flow

1. User submits login/register form
2. Frontend sends credentials to backend API
3. Backend validates and returns JWT token + user data
4. Frontend stores token in localStorage
5. Frontend includes token in Authorization header for subsequent requests
6. Backend middleware validates token for protected routes
7. On logout, frontend clears token from localStorage

## Development Tips

- Backend auto-restarts on file changes (using `tsx watch`)
- Frontend has instant HMR (Hot Module Replacement) via Vite
- Use Prisma Studio to view database: `npm run prisma:studio`
- Check backend logs for API errors
- Check browser console for frontend errors

## Next Features to Implement

- Groups management
- Expense tracking
- Split calculations
- Expense history
- Settlement tracking
- User profiles
- Friends management
- Notifications

## Tech Stack Summary

| Layer          | Technology       |
|----------------|------------------|
| Frontend       | React + TypeScript |
| Build Tool     | Vite             |
| Routing        | React Router     |
| Styling        | Tailwind CSS     |
| HTTP Client    | Axios            |
| Backend        | Express.js       |
| Language       | TypeScript       |
| Database       | PostgreSQL       |
| ORM            | Prisma           |
| Authentication | JWT              |
| Validation     | Zod              |
| Password Hash  | Bcrypt           |

## License

MIT
