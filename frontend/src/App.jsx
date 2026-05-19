import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import ProfileSettings from './pages/ProfileSettings';
import Gallery from './pages/Gallery';
import Feedback from './pages/Feedback';
import ContactUs from './pages/ContactUs';
import AICoach from './pages/AICoach';
import PlanGenerator from './pages/PlanGenerator/PlanGenerator';
import MealPlans from './pages/MealPlans';
import Workouts from './pages/Workouts';
import AdminKnowledgeBase from './pages/AdminKnowledgeBase';
import Landing from './pages/Landing';

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timeout: If Supabase doesn't respond in 5 seconds, stop loading
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
        clearTimeout(timeout);
      })
      .catch((err) => {
        console.error("Supabase connection error:", err);
        setLoading(false);
        clearTimeout(timeout);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (loading) {
    return <div className="h-screen flex items-center justify-center dark:bg-gray-900 dark:text-white">Loading...</div>;
  }

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
          <Route path="/register" element={!session ? <Register /> : <Navigate to="/" />} />
          <Route path="/landing" element={!session ? <Landing /> : <Navigate to="/" />} />

          {/* Protected Routes inside Layout */}
          <Route path="/" element={session ? <Layout /> : <Navigate to="/landing" />}>
            <Route index element={<Home />} />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="feedback" element={<Feedback />} />
            <Route path="contact" element={<ContactUs />} />
            <Route path="ai-coach" element={<AICoach />} />
            <Route path="plan-generator" element={<PlanGenerator />} />
            <Route path="meal-plans" element={<MealPlans />} />
            <Route path="workouts" element={<Workouts />} />
            <Route
              path="admin/knowledge"
              element={session?.user?.email === 'admin@mutaafi.com' ? <AdminKnowledgeBase /> : <Navigate to="/" />}
            />
            {/* Add more protected routes here like Workouts, etc. */}
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
