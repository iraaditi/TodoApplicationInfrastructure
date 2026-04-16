// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import MfaSetup from './components/MfaSetup';

function App() {
const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsLoggedIn(true);
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
      <Route 
        path="/settings" 
        element={
          isLoggedIn ? (
            <MfaSetup token={localStorage.getItem('token')} /> 
          ) : (
            <Navigate to="/" />
          )
        } 
      />
    </Routes>
  );
}

export default App;