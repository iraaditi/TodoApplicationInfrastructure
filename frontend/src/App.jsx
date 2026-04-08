// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  // Check if user is already logged in when the app loads
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
      // In a real app, you might decode the JWT here to check premium status,
      // but we will fetch it when we load the dashboard.
    }
  }, []);

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          isLoggedIn ? <Navigate to="/dashboard" /> : <Auth setIsLoggedIn={setIsLoggedIn} setIsPremium={setIsPremium} />
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          isLoggedIn ? (
            <Dashboard 
              setIsLoggedIn={setIsLoggedIn} 
              isPremium={isPremium} 
              setIsPremium={setIsPremium} 
            />
          ) : (
            <Navigate to="/" />
          )
        } 
      />
    </Routes>
  );
}

export default App;