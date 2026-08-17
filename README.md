# River Water Level

## Overview

A system to monitor river water levels in Selangor based on data from JPS Selangor.

Check it out live: [Water Level Monitoring System](https://riverlevel.netlify.app/)

## Features

- **Real-time Water Level Updates**: Display current water levels in rivers across Selangor.
- **Camera Integration**: View images from river cameras.
- **Advanced Filtering**: Filter stations by district, alert level, distance, and more.
- **Location-based Sorting**: Sort stations by distance from your current location.
- **Water Level Trend Charts**: View 3-hour water level trends for each station.
- **Progressive Web App (PWA)**: Provides an app-like experience with offline support.
- **Pull-to-Refresh**: Pull down to refresh data on mobile.
- **Dark Mode**: Full dark/light theme support.

## Tech Stack

- **Framework**: Next.js 14 (Pages Router)
- **Data Fetching**: TanStack Query (React Query)
- **Backend**: Convex (serverless database + functions)
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + shadcn/ui
- **Analytics**: PostHog
- **Deployment**: Netlify

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm

### Installation

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/luqman-haqeem/water-level.git
cd water-level
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env.local
```

### Running the Development Server

```bash
npm run dev
```

### Building for Production

```bash
npm run build
```

## Project Structure

- **pages/**: Next.js pages and API routes
- **components/**: Reusable React components
- **hooks/**: Custom React hooks (data fetching, gestures, location)
- **lib/**: Shared utilities (query client, Convex client, filter context)
- **convex/**: Convex backend functions and schema
- **utils/**: Helper utilities
- **styles/**: Global styles and Tailwind CSS configuration
- **public/**: Static assets
