# Poolr8ter 🎱 — V2 Blueprint: Full-Stack with Supabase

*A revised project plan focused on building a robust, scalable, and feature-rich application for a competitive pool league.*

---

## 1 · Project Goal (Revised)

> **Build** a full-stack web application that provides user authentication, a persistent ELO-based leaderboard, personal match histories, and a dynamic rulebook.
> **Foundation** will be built on a scalable architecture to support future features like seasons, tournaments, and richer UI/UX.
> **Tech Stack:**
> • **Frontend:** Static HTML, Tailwind CSS, Alpine.js (Hosted on GitHub Pages)
> • **Backend:** Cloudflare Worker in TypeScript for API logic.
> • **Database & Auth:** **Supabase** for the Postgres database and user authentication (JWT-based).

---

## 2 · Architecture (Revised)

The new architecture separates concerns for scalability and feature depth.

```txt
┌──────────────────┐      ┌──────────────────────┐      ┌──────────────────────────┐
│      Browser     │      │   Cloudflare Worker  │      │         Supabase         │
│ (User Interface) │      │ (API & Business Logic) │      │ (Database & Auth)        │
└─────────┬────────┘      └──────────┬───────────┘      └────────────┬─────────────┘
          │                         │                               │
          │ 1. GET / (HTML/JS/CSS)  │                               │
          ├────────────────────────►  GitHub Pages                  │
          │                         │                               │
          │ 2. POST /report (JWT, data) │                               │
          ├────────────────────────► Worker Endpoint ───────────────► 3. Validate JWT,
          │                         │                               │    INSERT match (SQL)
          │ 4. GET /leaderboard     │                               │
          ├────────────────────────► Worker Endpoint ───────────────► 5. SELECT players (SQL)
          │                         │                               │
          │ 6. Login/Signup         │                               │
          └─────────────────────────────────────────────────────────► 7. Authenticate User
```

**Flow:**
1.  The user's browser loads the static front-end from GitHub Pages.
2.  When a user logs in or signs up, the front-end communicates directly with the Supabase Auth endpoint.
3.  Upon successful login, Supabase returns a JSON Web Token (JWT).
4.  For all subsequent API requests (like reporting a match), the front-end sends this JWT in the `Authorization` header to the Cloudflare Worker.
5.  The Worker validates the JWT using Supabase's public key and, if valid, executes the business logic, querying the Supabase Postgres database.

---

## 3 · Database Schema (Postgres)

The data will be stored in a relational Postgres database managed by Supabase. This structure enables efficient querying for leaderboards, match histories, and user data.

### 3.1 `players` Table
Stores all information about a unique player.

```sql
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  elo INTEGER NOT NULL DEFAULT 1200,
  -- Supabase Auth handles user details, this links to it.
  -- The 'id' column here will be the same as the user's ID in Supabase's 'auth.users' table.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 `matches` Table
Stores all information about a single game, linking back to the players involved.

```sql
CREATE TABLE matches (
  id BIGSERIAL PRIMARY KEY,
  player1_id uuid NOT NULL REFERENCES players(id),
  player2_id uuid NOT NULL REFERENCES players(id),
  winner_id uuid NOT NULL REFERENCES players(id),

  player1_elo_before INTEGER NOT NULL,
  player1_elo_after INTEGER NOT NULL,
  player2_elo_before INTEGER NOT NULL,
  player2_elo_after INTEGER NOT NULL,

  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure a player cannot play against themselves
  CONSTRAINT check_players_not_same CHECK (player1_id <> player2_id)
);
```

---

## 4 · API Endpoints (Revised)

The Cloudflare Worker will handle all business logic. All endpoints that require a logged-in user will be protected and expect a valid Supabase JWT.

### `POST /report`
Reports the result of a new match.
*   **Auth:** Required. Expects `Authorization: Bearer <SUPABASE_JWT>`.
*   **Body:** `{ "opponent_id": "...", "winner_id": "..." }`
*   **Logic:**
    1.  Validate the JWT to get the reporting player's ID.
    2.  Fetch ELOs for both players from the `players` table.
    3.  Calculate new ELO ratings.
    4.  Insert a new row into the `matches` table with all details.
    5.  Update the `elo` column for both players in the `players` table.

### `GET /leaderboard`
Fetches the player leaderboard.
*   **Auth:** Not required.
*   **Logic:**
    1.  `SELECT username, elo FROM players ORDER BY elo DESC;`
    2.  Returns a sorted JSON array of players.

### `GET /matches`
Fetches the match history for the logged-in user.
*   **Auth:** Required. Expects `Authorization: Bearer <SUPABASE_JWT>`.
*   **Logic:**
    1.  Validate JWT to get the user's ID.
    2.  Query the `matches` table where `player1_id` or `player2_id` matches the user's ID.
    3.  Join with the `players` table to get opponent usernames.
    4.  Return a JSON array of match details.

---

## 5 · Front-End UI (Revised)

The UI is a single-page application (`index.html`) built with Tailwind CSS and Alpine.js for interactivity.

### 5.1 Design & Aesthetic
*   **Inspiration:** The design is inspired by the minimalist, data-driven interface of *Monkeytype* combined with a retro "80s After Dark" color theme.
*   **Color Palette:**
    *   Background: Dark Navy (`#1b1d36`)
    *   Primary Accent / Text: Soft Pink (`#fca6d1`)
    *   Secondary Text: Off-White (`#e1e7eb`)
    *   Highlights: Pastel Blue (`#99d6ea`) and Daffodil Yellow (`#ffe9a1`)
*   **Typography:**
    *   Primary Font: `Inter` (sans-serif)
    *   Data/Numbers: `JetBrains Mono` (monospaced) for alignment.

### 5.2 Current Status
*   A static visual prototype (`index.html`) has been created on the `bolt` branch.
*   This prototype includes the full page layout, tab navigation, and a placeholder leaderboard table that matches the target design.
*   Basic tab-switching functionality is implemented with vanilla JavaScript.

### 5.3 Auth Flow
*   **Public Access:** Users can view the `Leaderboard` and `Rules` tabs without logging in.
*   **Login Prompt:** Clicking on `Home/Track`, `Matches`, or `Account` will trigger a login/signup modal.

### 5.4 Tab Structure & Implementation Plan
The application will be a Single-Page App (SPA). The following components will be built out and dynamically displayed using Alpine.js.
1.  **Home/Track:** The main view for a logged-in user. Will contain the form to report a match.
2.  **Leaderboard:** A table displaying `Rank`, `Player`, `ELO`, `Wins`, `Losses`, `Win %`. This will be the first component to be made dynamic.
3.  **Matches:** A list/table of the logged-in user's past matches.
4.  **Account:** Displays user info and a logout button.
5.  **Rules:** An interactive "choose your own adventure" style guide.

---

## 6 · CI/CD with GitHub Actions (New Section)
To ensure code quality, automate deployments, and maintain an active development history, we will implement a CI/CD pipeline using GitHub Actions.

### 6.1 CI Workflow (`.github/workflows/ci.yml`)
This workflow will run on every push to the `main` branch.
*   **Trigger:** `on: push, branch: [main]`
*   **Jobs:**
    1.  **Lint & Test:**
        *   Check out the code.
        *   Install Node.js and dependencies (`npm install`).
        *   Run a linter (e.g., ESLint) to enforce code style.
        *   Run any automated tests for the worker.

### 6.2 CD Workflow (`.github/workflows/deploy.yml`)
This workflow will run after the CI workflow succeeds.
*   **Trigger:** `on: workflow_run, workflow: [CI], type: [completed], branch: [main]`
*   **Jobs:**
    1.  **Deploy Worker:**
        *   Check out the code.
        *   Use the official `wrangler-action` to publish the worker.
        *   Requires `CLOUDFLARE_API_TOKEN` to be stored in GitHub repository secrets.
    2.  **Deploy Frontend:**
        *   Check out the code.
        *   Use an action to deploy the contents of the `/public` directory to the `gh-pages` branch.

---

## 7 · Development Roadmap (Revised)

A high-level plan to guide the development process, now starting with CI/CD.

1.  **CI/CD Setup:**
    *   Create the `.github/workflows` directory.
    *   Define the `ci.yml` and `deploy.yml` workflow files.
    *   Add required secrets (like `CLOUDFLARE_API_TOKEN`) to the GitHub repository settings.
2.  **Backend Setup (Supabase & Worker):**
    *   Create a new project in Supabase.
    *   Use the Supabase SQL editor to create the `players` and `matches` tables.
    *   Configure the Cloudflare Worker with Supabase secrets.
    *   Refactor the Worker's `index.ts` to connect to Supabase and implement the revised API endpoints.
3.  **Frontend Implementation (UI & Auth):**
    *   Structure the `index.html` with the five tabs.
    *   Integrate the Supabase.js client library.
    *   Build the UI components for each tab.
4.  **Connecting Frontend & Backend:**
    *   Write the `fetch` logic to call the Worker API with the Supabase JWT.
5.  **Final Polish:**
    *   Finalize styling and ensure mobile responsiveness.

---

## 8 · Frontend To-Do List (New Section)

A checklist for the frontend development phase.

- [x] **Generate Static Components:**
    - [x] Home/Track (Dashboard Layout)
    - [x] Leaderboard (Full Table)
    - [x] Matches (History List)
    - [x] Account (User Details / Login)
    - [x] Rules (Interactive Guide)
- [x] **Refactor to Alpine.js:**
    - [x] Convert the vanilla JS tab switching and form logic to a unified Alpine.js component.
    - [ ] Convert the opponent search and selection to use Alpine.js.
    - [ ] Convert the custom radio buttons to use Alpine.js.
- [ ] **Implement Mobile Responsiveness:**
    - [ ] On smaller screens, the right-hand sidebar ("Top 5 Players") should be hidden to save space.
    - [ ] Ensure all tables and forms are legible and usable on a mobile device.
- [ ] **Integrate Supabase Auth:**
    - [ ] Implement login/signup functionality.
    - [ ] Protect tabs/routes that require authentication.
- [ ] **Make Components Dynamic:**
    - [ ] Fetch and display real data for the Leaderboard and Top 5 Players list.
    - [ ] Fetch and display real data for the Matches history.
    - [ ] Implement the logic for the "Report a Match" form to submit data to the backend.
- [ ] **Aesthetic Polish & UX (Future Tasks):**
    - [ ] **Layout:**
        - [ ] Fix vertical alignment of tab content to remove the large gap at the bottom (adjust `min-height` on main container).
        - [ ] Ensure text alignment (centered vs. left-aligned) is consistent and intentional across all tabs.
        - [ ] In the Matches tab, add padding to prevent the ELO text from being obscured by the scrollbar.
    - [ ] **Typography:**
        - [ ] Make font sizing more consistent across all components.
        - [ ] Consider a secondary font for headers or accents.
    - [ ] **Animation & Effects:**
        - [ ] Animate the active tab underline so it slides between tabs instead of appearing instantly.
        - [ ] Add a subtle background texture or gradient to the header/body to enhance the theme.
        - [ ] Use `x-transition` to smoothly fade/slide in elements that appear (e.g., the match form).
        - [ ] Implement an idle-screen animation with a bouncing pool ball inside the main container.
    - [ ] **User Experience (UX):**
        - [ ] Make opponent names in the match history clickable links to their profiles/history.
        - [ ] Add loading state indicators (spinners/skeletons) for when data is being fetched.
        - [ ] Add "empty state" views for components with no data (e.g., a new user's match history).
        - [ ] Implement client-side form validation (e.g., disable submit button until form is complete).