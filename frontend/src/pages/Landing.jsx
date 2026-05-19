/**
 * =========================================================================
 * Landing.jsx — Public Landing / Marketing Page
 * =========================================================================
 *
 * PURPOSE:
 *   The very first page unauthenticated visitors see.  It showcases the
 *   Mutaafi brand with a bold hero headline, a short value-proposition
 *   paragraph, and a dynamic masonry gallery of real meal images fetched
 *   from the Supabase `nutrition_data` table.
 *
 * FEATURE / PAGE:
 *   Public landing page — accessible without login.
 *
 * BACKEND CONNECTION:
 *   - supabase.from('nutrition_data')  — Fetches up to 30 meal images
 *     to populate the animated masonry gallery on the right side.
 *
 * RELATED COMPONENTS:
 *   - Masonry (../components/Masonry) — Renders the animated image grid.
 *   - App.jsx router — Renders this component at the root '/' route
 *     when no user is logged in.
 * =========================================================================
 */

// ======================= IMPORTS =======================
// Core React hooks and the React namespace (used by JSX transform)
import React, { useEffect, useState } from 'react';
// React Router link for client-side navigation
import { Link } from 'react-router-dom';
// Supabase client for querying meal images
import { supabase } from '../supabaseClient';
// Animated masonry grid component for the hero gallery
import Masonry from '../components/Masonry';
// Static logo asset for the navigation bar
import logo from '../assets/logo.png';

// ======================= COMPONENT =======================
/**
 * Landing — public-facing marketing page with hero text and image gallery.
 *
 * @returns {JSX.Element} A full-screen layout split into a text column
 *          (left) and an animated masonry image gallery (right).
 */
const Landing = () => {

  // ======================= STATE & HOOKS =======================

  // Array of image objects passed to the Masonry component for rendering
  const [masonryItems, setMasonryItems] = useState([]);

  /**
   * On mount, fetch meal images from Supabase and prepare them for the
   * masonry gallery.  Images are shuffled randomly so the layout looks
   * different on every visit.
   */
  useEffect(() => {
    /**
     * Fetches up to 30 meal images from the nutrition_data table,
     * shuffles them with the Fisher-Yates algorithm, and formats
     * each item with a random height for visual variety.
     *
     * @returns {Promise<void>}
     */
    const fetchImages = async () => {
      try {
        // Fetch 30 meals that have an image URL
        const { data: meals, error: mealError } = await supabase
          .from('nutrition_data')
          .select('meal_id, image_url')
          .not('image_url', 'is', null)
          .limit(30);

        if (mealError) return;

        const combined = (meals || []).map(m => ({ id: m.meal_id, image_url: m.image_url, type: 'meal' }));

        // Fisher-Yates shuffle for random gallery order
        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }

        // Format each item for the Masonry component with a random height
        const formattedItems = combined.map((item, index) => ({
          id: `${item.type}-${item.id}-${index}`, // ensure uniqueness
          img: item.image_url,
          url: '#',
          height: Math.floor(Math.random() * (700 - 400 + 1)) + 400 // return to large sizes
        }));

        setMasonryItems(formattedItems);
      } catch (err) {
        // Silently fail — the gallery will simply remain empty
      }
    };

    fetchImages();
  }, []);

  // ======================= RETURN (JSX) =======================
  return (
    <div className="min-h-screen bg-[#0d1117] text-white font-sans flex flex-col overflow-hidden relative">

      {/* ---------- TOP NAVIGATION BAR ---------- */}
      <header className="flex justify-between items-center py-6 px-8 lg:px-16 w-full absolute top-0 z-20">
        {/* Brand logo + name */}
        <div className="flex items-center gap-3">
          <img src={logo} alt="MUTAAFI Logo" className="h-16 w-auto mix-blend-screen" />
          <span className="text-xl font-bold tracking-wide">MUTAAFI</span>
        </div>

        {/* Auth links */}
        <div className="flex items-center gap-6">
          <Link to="/register" className="text-gray-300 hover:text-white transition-colors font-medium">
            Sign up
          </Link>
          <Link
            to="/login"
            className="bg-[#10b981] hover:bg-[#059669] text-white px-6 py-2.5 rounded-full font-medium transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      {/* ---------- MAIN BODY — two-column hero layout ---------- */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-screen">

        {/* Left Column — Hero text and CTA button */}
        <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 lg:px-16 pt-32 pb-12 lg:py-0 z-10 relative">
          <h1 className="text-5xl lg:text-7xl font-extrabold leading-tight mb-6">
            Your Personal AI <br />
            <span className="text-[#10b981]">Fitness & Nutrition</span> Coach
          </h1>
          <p className="text-gray-400 text-lg lg:text-xl max-w-xl mb-10 leading-relaxed">
            MUTAAFI builds custom meal plans and workout routines around your goals, age, and fitness level, with a smart RAG-powered chatbot that answers your questions using verified facts, not guesses.
          </p>
          <div>
            <Link
              to="/register"
              className="bg-[#10b981] hover:bg-[#059669] text-white px-8 py-4 rounded-full text-lg font-semibold transition-transform hover:scale-105 inline-block shadow-lg shadow-green-500/20"
            >
              Get Started
            </Link>
          </div>
        </div>

        {/* Right Column — Animated masonry image gallery */}
        <div className="w-full lg:w-1/2 h-[600px] lg:h-screen relative pt-24 lg:pt-32 pb-8 px-4 lg:px-8 overflow-hidden">
            {masonryItems.length > 0 && (
               <Masonry
                 items={masonryItems}
                 animateFrom="bottom"
                 blurToFocus={true}
                 scaleOnHover={true}
                 hoverScale={0.95}
                 colorShiftOnHover={false}
                 duration={0.6}
                 stagger={0.05}
               />
            )}

            {/* Gradient overlays to fade gallery edges into the dark background */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#0d1117] to-transparent pointer-events-none z-10 lg:block hidden"></div>
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0d1117] to-transparent pointer-events-none z-10"></div>
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0d1117] to-transparent pointer-events-none z-10"></div>
        </div>
      </main>
    </div>
  );
};

// ======================= EXPORT =======================
export default Landing;
