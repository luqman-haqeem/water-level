# River Water Level

## Overview

A real-time water level monitoring system for rivers in Selangor, Malaysia. Data is sourced from JPS Selangor (Jabatan Pengairan dan Saliran).

Check it out live: [Water Level Monitoring System](https://riverlevel.netlify.app/)

## Features

- **Real-time Water Level Updates**: Display current water levels in rivers across Selangor with 15-minute update intervals.
- **Camera Integration**: View live images from river cameras.
- **Advanced Filtering**: Filter stations by district, alert level, water level range, and more.
- **Location-based Sorting**: Sort stations by distance from your current location.
- **Progressive Web App (PWA)**: Provides an app-like experience with offline support.
- **Dark Mode**: Full dark/light theme support.

## Tech Stack

[![Vite](https://img.shields.io/badge/Vite_6-646CFF?logo=vite&logoColor=white)](#)
[![TanStack Router](https://img.shields.io/badge/TanStack_Router-FF4154?logo=react-query&logoColor=white)](#)
[![Convex](https://img.shields.io/badge/Convex-FF6F61?logo=convex&logoColor=white)](#)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-%2338B2AC.svg?logo=tailwind-css&logoColor=white)](#)
[![Radix UI](https://img.shields.io/badge/Radix_UI-161618?logo=radix-ui&logoColor=white)](#)

- **Vite 6** - Fast build tool and dev server
- **TanStack Router** - Type-safe client-side routing
- **Convex** - Real-time backend and database
- **Tailwind CSS** - Utility-first styling
- **Radix UI / shadcn/ui** - Accessible UI components
- **PostHog** - Product analytics
- **vite-plugin-pwa** - Progressive Web App support
- **OneSignal** - Push notifications

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- bun

### Installation

1. Clone the repository:

```bash
git clone https://github.com/luqman-haqeem/water-level.git
```

2. Navigate to the project directory:

```bash
cd water-level
```

3. Install dependencies:

```bash
bun install
```

4. Set up environment variables:

```bash
cp .env.example .env.local
# Add your VITE_CONVEX_URL and other required variables
```

### Running the Development Server

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result.

### Building for Production

```bash
bun run build
```

## Project Structure

- **`src/routes/`** - TanStack Router route components
- **`src/components/`** - Reusable React components (includes `ui/` for shadcn)
- **`src/hooks/`** - Custom React hooks
- **`src/lib/`** - Utilities, context providers
- **`src/services/`** - External service integrations (notifications)
- **`src/utils/`** - Helper utilities
- **`src/styles/`** - Global styles and Tailwind CSS configuration
- **`convex/`** - Backend functions, schema, and data sync logic
- **`public/`** - Static assets and PWA manifest

## Deployment

### Convex Backend

The Convex backend is automatically deployed via GitHub Actions when files in the `convex/` directory are pushed to `main`. The workflow can also be triggered manually.

**Required GitHub Secret:**

- `CONVEX_DEPLOY_KEY` - Convex deploy key from the [Convex dashboard](https://dashboard.convex.dev). Set this in your repository Settings > Secrets and variables > Actions.

### Frontend

The frontend is deployed automatically via Netlify on push to `main`. The build uses Vite to produce optimized static assets.
