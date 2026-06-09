# NovaSend

NovaSend is a professional, self-hosted WhatsApp Web campaign automation and delivery management platform. It allows users to safely and efficiently execute bulk notification campaigns with advanced anti-blocking controls.

## Key Features

- **Anti-Blocking Delivery Pacing**: Fully customizable batch sizes, minimum/maximum delays, and hourly sending limits to mimic natural human behavior.
- **Warm-Up Mode**: Automatically throttle message volume for newly connected accounts, ramping up limits dynamically day-by-day.
- **Spintax & Personalization**: Native support for recursive spintax options (e.g. `{Hi|Hello} {FirstName}`) to generate unique messages per contact.
- **Opt-Out Detection**: Scans active chats for opt-out trigger words (`stop`, `unsubscribe`, `exit`) to automatically mark contacts as unsubscribed and skip future sends.
- **Diagnostics & Telemetry**: Track successful sends, failed attempts, session resets, and browser crashes per WhatsApp account directly from the UI.
- **Modern User Interface**: A premium, responsive glassmorphic dashboard with customizable gradient theme palettes.

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Python, Flask, SQLAlchemy (SQLite database)
- **Automation Engine**: Playwright-based browser controller with advanced stealth evasion parameters

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python (3.10+)

### Setup & Run Locally

1. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

2. **Install Backend Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Playwright Browser Drivers**:
   ```bash
   playwright install chromium
   ```

4. **Run the Application**:
   - Start the backend server:
     ```bash
     python run.py
     ```
   - Start the Vite development server:
     ```bash
     npm run dev
     ```

## Deployment

This repository includes a `Dockerfile` and `railway.toml` pre-configured for deployment on **Railway**. The Docker container will automatically build the React assets and run the Flask server to host the full application.
