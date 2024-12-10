# River Water Level

## Overview

A system to monitor river water levels in Selangor based on data from JPS Selangor.

Check it out live: [Water Level Monitoring System](https://waterlvl.online)


## Features

- **Real-time Water Level Updates**: Display current water levels in rivers across Selangor.
- **Camera Integration**: View images from river cameras.
- **User Authentication**: Secure user authentication using Supabase.
- **Favorites Management**: Users can mark stations and cameras as favorites.
- **Progressive Web App (PWA)**: Provides an app-like experience with offline support.

## 💻 Tech Stack

[![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js&logoColor=white)](#)
[![TailwindCSS](https://img.shields.io/badge/Tailwind%20CSS-%2338B2AC.svg?logo=tailwind-css&logoColor=white)](#)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=fff)](#)

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Installation

1. Clone the repository:

```bash
git  clone  https://github.com/yourusername/river-water-level.git
```

2. Navigate to the project directory:

```bash
cd  river-water-level
```

3. Install dependencies:

```bash
npm  install
# or
yarn  install
```

### Running the Development Server

Start the development server:

```bash
npm  run  dev
# or
yarn  dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Building for Production

To build the application for production:

```bash
npm  run  build
# or
yarn  build
```
## Project Structure

-  **`pages/`**: Contains Next.js pages and API routes.
-  **`components/`**: Reusable React components.
-  **`public/`**: Static assets like images and the service worker.
-  **`utils/`**: Utility functions and helpers.
-  **`styles/`**: Global styles and Tailwind CSS configuration.

## API Routes

-  **`/api/proxy-image/[id]`**: Fetches and serves images from external sources.
