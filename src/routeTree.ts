import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { RootLayout } from "./routes/__root";
import { StationsRoute } from "./routes/stations/index";
import { StationDetailRoute } from "./routes/stations/$id";
import { CamerasRoute } from "./routes/cameras/index";

// Create the root route
const rootRoute = createRootRoute({
    component: RootLayout,
});

// Create child routes
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: () => {
        throw redirect({ to: "/stations" });
    },
});

const stationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/stations",
    component: StationsRoute,
});

const stationDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/stations/$id",
    component: StationDetailRoute,
});

const camerasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/cameras",
    component: CamerasRoute,
});

// Create the route tree
const routeTree = rootRoute.addChildren([
    indexRoute,
    stationsRoute,
    stationDetailRoute,
    camerasRoute,
]);

// Create and export the router
export const router = createRouter({ routeTree });

// Type registration for type-safe routing
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
