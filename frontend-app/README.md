# Splitwise Clone - Frontend

React + TypeScript frontend for the Splitwise Clone expense sharing application.

## Tech Stack

- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **State Management**: React Context API

## Features

✅ User registration with validation
✅ User login
✅ JWT authentication
✅ Protected routes
✅ Logout functionality
✅ Responsive design
✅ Loading states
✅ Error handling

## Project Structure

```
frontend-app/
├── public/
├── src/
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── ProtectedRoute.tsx
│   ├── config/
│   │   └── api.ts
│   ├── context/
│   │   └── AuthContext.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   └── Register.tsx
│   ├── services/
│   │   └── auth.service.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env.example
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd frontend-app
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Run Development Server

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Routes

- `/` - Redirects to login
- `/login` - Login page
- `/register` - Registration page
- `/dashboard` - Protected dashboard (requires authentication)

## Authentication Flow

1. User logs in or registers
2. Backend returns JWT token
3. Token stored in localStorage
4. Token sent in Authorization header for API requests
5. Protected routes check for valid token
6. Logout clears token from localStorage

## Components

### Input
Reusable input component with label and error display.

### Button
Reusable button with loading state and variants (primary, secondary, danger).

### Card
Container component for content sections.

### ProtectedRoute
Wrapper component that redirects to login if user is not authenticated.

## Context API

### AuthContext
Manages global authentication state:
- `user`: Current user object
- `isAuthenticated`: Boolean authentication status
- `isLoading`: Initial loading state
- `login()`: Save token and user
- `logout()`: Clear token and user

## Services

### authService
Handles all authentication API calls:
- `register()`: Create new user
- `login()`: Authenticate user
- `getProfile()`: Get current user profile
- `logout()`: Clear local storage
- `saveAuth()`: Store token and user
- `getToken()`: Retrieve stored token
- `getUser()`: Retrieve stored user
- `isAuthenticated()`: Check if user is logged in

## Styling

Uses Tailwind CSS with custom color scheme:
- Primary: Green shades for main actions
- Gray scale for text and backgrounds
- Red for errors and warnings

## Development Notes

- Vite provides fast HMR (Hot Module Replacement)
- TypeScript strict mode enabled
- Path alias `@/` configured for imports
- Axios interceptors add JWT token to requests automatically
- React Router handles client-side routing
- Context API manages global state without external libraries

## Demo Credentials

Use these credentials to test (after running backend seed):

| Name  | Email               | Password    |
|-------|---------------------|-------------|
| Aisha | aisha@example.com   | password123 |
| Rohan | rohan@example.com   | password123 |
| Priya | priya@example.com   | password123 |
| Meera | meera@example.com   | password123 |
| Dev   | dev@example.com     | password123 |
| Sam   | sam@example.com     | password123 |

## Next Steps

- Add groups management UI
- Add expense tracking
- Add split calculations
- Add expense history
- Add settlement tracking
- Add user profiles
- Add friends management
