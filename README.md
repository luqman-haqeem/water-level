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

[![Next.js](https://img.shields.io/badge/Next.js_14-black?logo=next.js&logoColor=white)](#)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?logo=react-query&logoColor=white)](#)
[![Convex](https://img.shields.io/badge/Convex-FF6F61?logo=convex&logoColor=white)](#)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-%2338B2AC.svg?logo=tailwind-css&logoColor=white)](#)
[![Radix UI](https://img.shields.io/badge/Radix_UI-161618?logo=radix-ui&logoColor=white)](#)

- **Next.js 14** (Pages Router) - React framework
- **TanStack Query** - Data fetching and caching
- **Convex** - Backend database and serverless functions
- **Tailwind CSS** - Utility-first styling
- **Radix UI / shadcn/ui** - Accessible UI components
- **PostHog** - Product analytics
- **next-pwa** - Progressive Web App support

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm

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
npm install
```

4. Set up environment variables:

```bash
cp .env.example .env.local
# Add your NEXT_PUBLIC_CONVEX_URL and other required variables
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Building for Production

```bash
npm run build
```

## Project Structure

- **`pages/`** - Next.js pages and API routes
- **`components/`** - Reusable React components (includes `ui/` for shadcn components)
- **`hooks/`** - Custom React hooks (data fetching, gestures, location)
- **`lib/`** - Utilities, context providers, and query client configuration
- **`convex/`** - Backend functions, schema, and data sync logic
- **`utils/`** - Helper utilities
- **`styles/`** - Global styles and Tailwind CSS configuration
- **`public/`** - Static assets and service worker

## API Routes

- **`/api/proxy-image/[id]`** - Proxies camera images from external sources
