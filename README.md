<div align="center">

# 🏋️ MUTAAFI

### AI-Powered Fitness & Nutrition Platform

*Personalized workout plans · Intelligent meal generation · RAG-powered AI Coach*

**CPCS 499 — Senior Capstone Project · King Abdulaziz University · 2025–2026**

---

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?style=flat&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com)
[![Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev)

</div>

---

## 📌 What is MUTAAFI?

**MUTAAFI** (مُتعافِي — Arabic for *one who recovers / gets well*) is a full-stack AI fitness and nutrition platform. It generates personalized meal and workout plans, tracks daily activity, and answers health questions through a conversational AI coach — all tailored to the authenticated user's body metrics, goals, and dietary restrictions.

The platform is built around three core AI systems:

| System | Technology | Purpose |
|--------|-----------|---------|
| **Meal Recommender** | Collaborative Filtering + RMSE | Generates daily meal plans personalized to goals and preferences |
| **Workout Scheduler** | Random Forest Classifier | Predicts optimal weekly workout split from user profile |
| **AI Coach** | RAG (Gemini Embeddings + pgvector) | Answers fitness/nutrition questions grounded in a verified knowledge base |

---

## 📐 System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        MUTAAFI Platform                                  │
│                                                                          │
│   ┌──────────────────────┐          ┌──────────────────────────────┐    │
│   │   React Frontend     │◄────────►│     Flask Backend (app.py)   │    │
│   │   (Vite + React 19)  │  REST    │     localhost:5000           │    │
│   │   localhost:5173     │  JSON    └──────────┬───────────────────┘    │
│   └──────────────────────┘                     │                        │
│                                                │  imports                │
│   ┌─────────────────────────────────────────────┼──────────────────┐    │
│   │                  Backend Modules             │                  │    │
│   │  ┌──────────────────┐  ┌────────────────────▼──────────────┐  │    │
│   │  │  meal_planner.py │  │     workout_planner.py            │  │    │
│   │  │  CF + RMSE engine│  │  Random Forest + split engine     │  │    │
│   │  └──────────────────┘  └───────────────────────────────────┘  │    │
│   └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   ┌──────────────────────────┐   ┌──────────────────────────────────┐   │
│   │   Supabase (PostgreSQL)  │   │      Google Gemini API           │   │
│   │   ├── user_data          │   │   ├── gemini-embedding-001       │   │
│   │   ├── nutrition_data     │   │   │   (768-dim vector search)    │   │
│   │   ├── workout_data       │   │   └── gemini-2.5-flash           │   │
│   │   ├── chatbot_knowledge_base   │       (text generation)        │   │
│   │   │   (pgvector)         │   └──────────────────────────────────┘   │
│   │   └── + 7 more tables    │                                          │
│   └──────────────────────────┘                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### 🔐 Authentication & Onboarding
- Supabase Auth (email/password) with JWT session management
- Multi-step registration form: personal info, body metrics, fitness goals, dietary preferences, and food allergies
- Automatic BMR/TDEE calculation using the **Mifflin-St Jeor equation** during registration
- Dark / Light mode toggle (persisted via React Context)

### 📊 Dashboard
- Personalized greeting with today's date and user name
- Real-time daily stats: workout count, calorie intake, protein intake, BMI
- Weekly active days counter
- **4-week Activity Heatmap** — visual consistency tracker showing completed workouts and meals per day

### 🥗 AI Meal Planner
A 4-stage hybrid recommendation pipeline:
1. **Hard-constraint filtering** — eliminates allergen meals and respects dietary tags (vegan, gluten-free, etc.)
2. **User-based Collaborative Filtering** — Pearson correlation across the user-meal interaction matrix
3. **Nutritional RMSE scoring** — ranks meals by calorie/protein match to daily targets
4. **Goal-dependent weighting** — `alpha` (CF weight) and `beta` (RMSE weight) adjust per goal type

Features:
- Generates a full daily plan: Breakfast, Lunch, Snack, Dinner
- One-click meal swap per slot with exclusion memory
- Meal completion tracking (per-slot toggle)
- Save/bookmark meals from the Gallery
- Meal interaction logging (eaten, saved, viewed, swapped, rejected)

### 🏋️ AI Workout Planner
- **AI mode**: Random Forest classifier predicts the best weekly split (Full Body, PPL 2×, Upper/Lower, etc.) from the user profile
- **Manual mode**: user selects how many days per week to train
- Exercise selection engine: targets specific muscles, respects difficulty level and equipment access, avoids cross-day duplicates
- Today's Workout page with sets/reps entry, weight logging, and per-exercise completion toggle
- Cardio exercise support (duration-based, not sets/reps)
- **PDF Export** of the full 7-day plan using `jsPDF` + `html2canvas`
- Workout interaction logging (rated, swapped, disliked)
- Historical performance tracking (last weight/sets/reps per exercise)

### 🤖 RAG AI Coach
A full Retrieval-Augmented Generation pipeline:
1. Embeds user query → `gemini-embedding-001` (768-dim)
2. Retrieves top-K relevant documents via **pgvector cosine similarity**
3. Applies allergen safety filter (post-retrieval)
4. Injects user profile context (goals, allergies, calorie targets)
5. Enforces medical safety rules (redirects clinical questions to professionals)
6. Generates response via `gemini-2.5-flash`

Features:
- Full-page chat interface (`AICoach.jsx`)
- Floating chat overlay accessible app-wide (`GlobalChatOverlay.jsx`)
- Markdown-rendered AI responses (links, lists, bold, code)
- Source attribution footer on every AI message
- Admin panel to add knowledge entries with auto-embedding (`/admin/knowledge`)

### 🔍 Explore Gallery
- Browse the full exercise and meal catalogue
- **Fuzzy search** using Levenshtein distance
- Muscle-group filters, calorie range filters, tag-based filtering with autocomplete
- Allergen safety warnings personalized to the logged-in user
- Save/unsave bookmarks for meals

### 👤 Profile Settings
- Edit personal details, body metrics, fitness goals, dietary preferences, and allergies
- Automatic calorie/protein target recalculation on every save
- Password change with Supabase Auth

### 💬 Feedback & Contact
- Star-rating feedback form with message submission
- Contact form with subject and message fields

---

## 🗂️ Project Structure

```
MUTAAFI/
│
├── backend/
│   ├── app.py                      # Flask entry point — all REST API endpoints (1,344 lines)
│   ├── meal_planner.py             # CF + RMSE meal recommendation engine
│   ├── workout_planner.py          # Random Forest + split selection workout engine
│   ├── train_workout_model.py      # RF model training script (5,000 synthetic profiles)
│   ├── seed_knowledge.py           # Manual knowledge base seeder (Gemini embeddings)
│   ├── ingest_meals_exercises.py   # Bulk knowledge base ingestion from DB tables
│   ├── generate_synthetic_data.py  # Synthetic user/interaction data generator (CF training)
│   ├── evaluate_model.py           # CF model evaluation (RMSE, MAE, Precision@K, NDCG@K)
│   ├── evaluate_cf.py              # Enhanced CF evaluation (Leave-K-Out protocol)
│   ├── evaluate_ragas.py           # RAG quality evaluation — full RAGAS suite
│   ├── run_limited_ragas.py        # RAG evaluation — lightweight 3-question version
│   ├── cleanup_null_users.py       # Utility: remove orphaned user records
│   ├── validate_calfix.py          # Utility: validate calorie fix logic
│   ├── seed_templates.py           # Seed workout split template data
│   ├── test_supabase.py            # Supabase connectivity smoke test
│   ├── ml_models/
│   │   ├── rf_workout_model.pkl    # Trained Random Forest classifier
│   │   ├── label_encoder.pkl       # LabelEncoder for schedule type labels
│   │   ├── scaler.pkl              # StandardScaler for numeric features
│   │   └── feature_cols.pkl        # Ordered feature column names
│   └── .env.example                # Environment variable template
│
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx                # React entry point
        ├── App.jsx                 # Router — all page routes + auth guard
        ├── supabaseClient.js       # Supabase client initialization
        ├── context/
        │   └── ThemeContext.jsx    # Dark/Light mode provider
        ├── components/
        │   ├── Layout.jsx          # Authenticated shell (sidebar + top bar)
        │   ├── GlobalChatOverlay.jsx # Floating RAG chat widget
        │   ├── MealCard.jsx        # Reusable meal card component
        │   └── Masonry.jsx         # Masonry grid layout utility
        ├── pages/
        │   ├── Landing.jsx         # Public landing/marketing page
        │   ├── Login.jsx           # Login form
        │   ├── Register.jsx        # Multi-step registration + onboarding
        │   ├── Home.jsx            # Dashboard (stats + heatmap)
        │   ├── Gallery.jsx         # Explore workouts & meals catalogue
        │   ├── MealPlans.jsx       # Daily meal plan view + tracking
        │   ├── Workouts.jsx        # Today's workout + completion tracking
        │   ├── AICoach.jsx         # Full-page RAG chatbot
        │   ├── AdminKnowledgeBase.jsx # Admin knowledge base manager
        │   ├── ProfileSettings.jsx # Profile editor
        │   ├── Feedback.jsx        # User feedback form
        │   ├── ContactUs.jsx       # Contact form
        │   └── PlanGenerator/
        │       ├── PlanGenerator.jsx     # Entry — AI or Manual mode selector
        │       ├── SelectionView.jsx     # Day selection & workout plan preview
        │       ├── MealResultView.jsx    # Meal plan result + swap + accept
        │       └── WorkoutResultView.jsx # Workout result + swap + accept + PDF
        └── utils/
            └── exportPdf.js        # jsPDF + html2canvas PDF export utility
```

---

## ⚙️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend Framework** | React | 19 |
| **Build Tool** | Vite | 8.x |
| **CSS Framework** | TailwindCSS | 4.x |
| **Routing** | React Router DOM | 7.x |
| **Markdown Rendering** | react-markdown | 10.x |
| **PDF Export** | jsPDF + html2canvas | Latest |
| **Animations** | GSAP | 3.x |
| **Icons** | Lucide React | Latest |
| **Backend Framework** | Flask + Flask-CORS | 3.x |
| **ML / Data** | scikit-learn, numpy, pandas, joblib | Latest |
| **LLM / Embeddings** | Google Gemini (`google-genai`) | Latest |
| **RAG Evaluation** | RAGAS, LangChain Google GenAI | Latest |
| **Database** | Supabase (PostgreSQL + pgvector) | Latest |
| **Auth** | Supabase Auth (JWT) | Latest |
| **Environment** | python-dotenv | Latest |

---

## 🗄️ Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `user_data` | User profiles: body metrics, goals, dietary preferences, allergies, computed targets |
| `nutrition_data` | Meal catalogue: macros, calories, tags, allergens |
| `workout_data` | Exercise catalogue: muscle group, difficulty, equipment, video URLs |
| `chatbot_knowledge_base` | RAG knowledge entries with `vector(768)` embeddings |
| `workout_plans` | Generated weekly workout plans (active/inactive) |
| `workout_split_templates` | Day-label templates per split type (PPL, Full Body, etc.) |
| `user_workout_schedule` | Per-day exercise schedule with completion & performance tracking |
| `user_workout_interactions` | Workout interaction log (rated, swapped, disliked) |
| `user_meal_plan` | Accepted daily meal plan (per slot, per date) |
| `user_meal_interactions` | Meal interaction log (eaten, saved, viewed, swapped, rejected) |
| `feedback` | User star-rating feedback submissions |
| `contact_messages` | User contact form submissions |

### pgvector Semantic Search Function

```sql
CREATE OR REPLACE FUNCTION match_knowledge_docs(
  query_embedding vector(768),
  match_count int DEFAULT 3
)
RETURNS TABLE (
  doc_id bigint,
  content_summary text,
  source_title text,
  source_url text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT kb.doc_id, kb.content_summary, kb.source_title, kb.source_url,
         1 - (kb.embedding_vector <=> query_embedding) AS similarity
  FROM chatbot_knowledge_base kb
  ORDER BY kb.embedding_vector <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## 🚀 Getting Started

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+
- A **[Supabase](https://supabase.com)** project with the schema above created
- A **[Google AI Studio](https://aistudio.google.com)** API key (Gemini access)

---

### 1. Clone the Repository

```bash
git clone https://github.com/OmarMohGh/MUTAAFI-Platform.git
cd MUTAAFI-Platform
```

### 2. Backend Setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install flask flask-cors python-dotenv supabase google-genai \
            scikit-learn numpy pandas joblib

# Configure environment
cp .env.example .env
# Edit .env and add your keys

# Start the Flask server
python app.py
# Server starts at http://localhost:5000
```

**`.env` file:**

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
GOOGLE_API_KEY=your_google_gemini_api_key_here
```

### 3. Frontend Setup

```bash
cd frontend

npm install

# Create .env file
echo "VITE_SUPABASE_URL=https://your-project.supabase.co" > .env
echo "VITE_SUPABASE_ANON_KEY=your_anon_key_here" >> .env

npm run dev
# App starts at http://localhost:5173
```

### 4. Seed the Knowledge Base (Optional)

```bash
cd backend
python ingest_meals_exercises.py  # Bulk-ingest from DB tables
python seed_knowledge.py          # Add manual knowledge entries
```

### 5. Retrain the Workout ML Model (Optional)

```bash
cd backend
pip install scikit-learn numpy pandas joblib
python train_workout_model.py
# Saves artifacts to backend/ml_models/
```

---

## 📡 API Reference

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server heartbeat |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard/<user_id>` | Aggregated daily stats + 35-day activity heatmap |

### Gallery
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/gallery/workouts` | Full exercise catalogue |
| `GET` | `/api/gallery/meals` | Full meal catalogue with nutrition |

### User Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/calculate-targets` | Compute calorie/protein targets (Mifflin-St Jeor) |

### Meal Planner
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/meal-plan/generate` | Generate a daily meal plan (CF + RMSE) |
| `POST` | `/api/meal-plan/swap` | Swap a single meal slot |
| `POST` | `/api/meal-plan/interact` | Log a meal interaction |
| `GET` | `/api/meal-plan/interactions/<user_id>` | Fetch user meal interactions |
| `POST` | `/api/meal-plan/accept` | Save the accepted daily plan |
| `GET` | `/api/meal-plan/active/<user_id>` | Fetch today's accepted plan |
| `POST` | `/api/meal-plan/complete` | Mark all meals for a date as complete |
| `POST` | `/api/meal-plan/complete-meal` | Toggle single meal completion |

### Workout Planner
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/workout/generate-plan` | Generate weekly plan (AI or manual mode) |
| `POST` | `/api/workout/swap-exercise` | Swap a single exercise |
| `POST` | `/api/workout/accept-plan` | Save accepted plan to schedule |
| `GET` | `/api/workout/today/<user_id>` | Fetch today's scheduled exercises |
| `POST` | `/api/workout/finish` | Mark all of today's exercises complete |
| `POST` | `/api/workout/complete-exercise` | Toggle single exercise completion |
| `GET` | `/api/workout/full-plan/<user_id>` | Fetch full 7-day plan for PDF export |
| `POST` | `/api/workout/interact` | Log a workout interaction |

### RAG AI Coach
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | RAG chatbot — embed, retrieve, generate |
| `POST` | `/api/admin/knowledge` | Add knowledge entry (admin only) |

### Feedback & Contact
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/feedback` | Submit star-rating feedback |
| `POST` | `/api/contact` | Submit contact form message |

---

## 🤖 AI & ML Models

### Random Forest — Workout Schedule Classifier

**Training (`train_workout_model.py`):**
- 5,000 synthetic user profiles with realistic distributions
- Features: age, BMI, gender, experience level, goal type, activity level, days available, equipment access
- Labels: Full Body, Upper/Lower, PPL, PPL 2×, Body Part Split, etc.
- 80/20 train/test split + 5-fold cross-validation
- Artifacts: `rf_workout_model.pkl`, `label_encoder.pkl`, `scaler.pkl`, `feature_cols.pkl`

### Collaborative Filtering — Meal Recommender

**Algorithm (`meal_planner.py`):**
- User-based CF with Pearson correlation
- Minimum 2 interactions to qualify (`CF_MIN_INTERACTIONS = 2`)
- Top-20 neighbors (`CF_TOP_K_NEIGHBORS = 20`)
- Goal-dependent blend weights:

| Goal | CF Weight (α) | RMSE Weight (β) |
|------|--------------|-----------------|
| Weight Loss | 0.20 | 0.80 |
| Muscle Gain | 0.15 | 0.85 |
| Maintenance | 0.35 | 0.65 |

**Evaluation:** RMSE, MAE, Precision@K, Recall@K, F1@K, NDCG@K, Coverage, Sparsity

### RAG Chatbot — Gemini + pgvector

**Pipeline (`/api/chat`):**
1. Embed query → `gemini-embedding-001` (768-dim)
2. Retrieve top-10 candidates via pgvector cosine similarity
3. Allergen post-filtering → keep top-3 safe documents
4. Inject user profile context (personalization)
5. Apply medical safety guardrails
6. Generate → `gemini-2.5-flash`

**Evaluation:** Faithfulness, Answer Relevancy, Context Precision, Context Recall (RAGAS)



---



## 👥 Team

**MUTAAFI Development Team — CPCS 499 (2025–2026)**
King Abdulaziz University — Faculty of Computing & Information Technology



## 📄 License

This project was developed as a senior capstone project (CPCS 499) at King Abdulaziz University.
All rights reserved © 2026 MUTAAFI Team.
