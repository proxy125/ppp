import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Context Providers
import { AuthProvider } from './context/AuthContext';

// Layouts
import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import PostDetailsPage from './pages/PostDetailsPage';
import MembershipPage from './pages/MembershipPage';

// Dashboard Pages
import MyProfile from './pages/dashboard/MyProfile';
import AddPost from './pages/dashboard/AddPost';
import MyPosts from './pages/dashboard/MyPosts';
import CommentsPage from './pages/dashboard/CommentsPage';

// Admin Pages
import AdminProfile from './pages/admin/AdminProfile';
import ManageUsers from './pages/admin/ManageUsers';
import ReportedComments from './pages/admin/ReportedComments';
import MakeAnnouncement from './pages/admin/MakeAnnouncement';

// Protected Route Component
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-secondary-50">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<MainLayout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="post/:id" element={<PostDetailsPage />} />
              </Route>

              {/* Protected Routes */}
              <Route path="/membership" element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route index element={<MembershipPage />} />
              </Route>

              {/* User Dashboard */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }>
                <Route path="profile" element={<MyProfile />} />
                <Route path="add-post" element={<AddPost />} />
                <Route path="my-posts" element={<MyPosts />} />
                <Route path="comments/:postId" element={<CommentsPage />} />
              </Route>

              {/* Admin Routes */}
              <Route path="/admin" element={
                <AdminRoute>
                  <DashboardLayout isAdmin />
                </AdminRoute>
              }>
                <Route path="profile" element={<AdminProfile />} />
                <Route path="users" element={<ManageUsers />} />
                <Route path="reported-comments" element={<ReportedComments />} />
                <Route path="announcements" element={<MakeAnnouncement />} />
              </Route>

              {/* 404 Page */}
              <Route path="*" element={
                <div className="min-h-screen flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-secondary-900 mb-4">404</h1>
                    <p className="text-secondary-600 mb-8">Page not found</p>
                    <a href="/" className="btn-primary">Go Home</a>
                  </div>
                </div>
              } />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
