import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export function IndexRoute() {
    const navigate = useNavigate();

    useEffect(() => {
        navigate({ to: "/stations", replace: true });
    }, [navigate]);

    return null;
}
