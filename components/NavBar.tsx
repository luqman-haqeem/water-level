

import { ModeToggle } from "@/components/ModeToggle";
import { AuthHeader } from "./AuthHeader";
import NavBarTab from "@/components/NavBarTab";


export default function NavBar() {


    return (

        <header className="border-b px-4 py-2 flex justify-between items-center">
            <div className="flex items-center">
                <NavBarTab />
            </div>
            <div className="flex items-center">
                <ModeToggle />
                <AuthHeader />
            </div>

        </header>

    );
}