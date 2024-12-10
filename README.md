# River Water Level

## Overview

The River Water Level application is a tool to view the current water level in rivers in Selangor. It leverages Next.js for server-side rendering, React for the frontend, and Supabase for backend services.

## Features

- **Real-time Water Level Updates**: Display current water levels in rivers across Selangor.
- **Camera Integration**: View live images from river cameras.
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
