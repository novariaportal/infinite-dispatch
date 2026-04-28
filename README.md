# ✈️ Infinite Dispatch

**Infinite Dispatch** is an automated, real-time Virtual Airline career tracker and economy system built for **Infinite Flight**.

Unlike traditional VAs, Infinite Dispatch features a randomized job market, a full licensing progression system, and a custom flight tracker designed specifically to handle Infinite Flight's "Autopilot Plus" feature without dropping flights.

---

## 🌟 Key Features

### 1. The License Economy
Pilots start at the bottom and work their way up through a realistic license progression:
*   **PPL (Private Pilot License):** Start with small GA aircraft (C172, SR22, TBM9) and a $500 bank balance.
*   **CPL (Commercial Pilot License):** Unlock regional jets and access the RNG Job Market.
*   **MPL (Multi-Crew Pilot License):** Unlock mid-size airliners.
*   **ATPL (Airline Transport Pilot License):** Unlock heavy long-haul aircraft.

### 2. The RNG Job Market
Instead of flying whatever you want, whenever you want, pilots must check the **Job Market**. The system randomly generates contracts based on real-world Infinite Flight fleet pairings (e.g., "Singapore Airlines requires a 777 captain from WSSS to YSSY"). 

### 3. "Session Stitching" Flight Tracker (Autopilot+ Compatible)
Traditional trackers fail when a user engages "Autopilot Plus" because the aircraft disappears from the Live API. Infinite Dispatch uses **Checkpoint Tracking**:
1.  **Departure:** The server logs your takeoff and aircraft.
2.  **The Pause:** You engage Autopilot+, disappearing from the Live API. The server places your flight on "Approach Hold".
3.  **The Arrival:** You resume 30 minutes from the destination, reappearing on the API. The server reconnects your session and awards **full XP and pay** for the entire elapsed time when you land.

### 4. SimBrief Integration
Fully integrated with the public SimBrief API. Pilots simply type their username, and the dashboard instantly fetches their latest generated flight plan, route, aircraft, and block fuel.

### 5. IFC Bio Verification
No manual admin approvals required. Users create an account by placing a randomly generated 6-digit code (e.g., `DISPATCH-8492`) into their Infinite Flight Community (IFC) forum bio. The server automatically verifies their identity and logs them in.

---

## 🛠️ Local Setup & Installation

If you want to run Infinite Dispatch on your own machine for testing:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/novariaportal/infinite-dispatch.git
   cd infinite-dispatch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set your API Key:**
   You must have an Infinite Flight Live API key. Set it as an environment variable:
   *   *Windows:* `set IF_API_KEY=your_key_here`
   *   *Mac/Linux:* `export IF_API_KEY=your_key_here`

4. **Start the server:**
   ```bash
   npm start
   ```
5. Open your browser and go to `http://localhost:3000`

---

## 🚀 Deployment (Heroku / DigitalOcean)

To keep the server awake 24/7 to track long-haul flights, deploy this app using a service like Heroku or DigitalOcean App Platform.

**CRITICAL SECURITY NOTE:** 
**Never** paste your `IF_API_KEY` directly into the code. When deploying:
1. Go to your host's Dashboard (e.g., Heroku Settings -> Config Vars).
2. Add a new Environment Variable.
3. Key: `IF_API_KEY` | Value: `(Your Actual Key)`

---
*Built by @novariaportal*