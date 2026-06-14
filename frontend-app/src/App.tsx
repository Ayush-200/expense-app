import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Groups } from './pages/Groups';
import { CreateGroup } from './pages/CreateGroup';
import { GroupDetail } from './pages/GroupDetail';
import { Expenses } from './pages/Expenses';
import { ExpenseDetail } from './pages/ExpenseDetail';
import { Balances } from './pages/Balances';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
          <Route path="/groups/create" element={<ProtectedRoute><CreateGroup /></ProtectedRoute>} />
          <Route path="/groups/:id" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
          <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
          <Route path="/expenses/:id" element={<ProtectedRoute><ExpenseDetail /></ProtectedRoute>} />
          <Route path="/balances" element={<ProtectedRoute><Balances /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
