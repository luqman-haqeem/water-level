

import { LoginButton } from "./LoginButton";
import { UserHeaderDropdown } from "./UserHeaderDropdown";
import { createClient } from "@/utils/supabase/server";


export async function AuthHeader() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();


    return user ? (
        <UserHeaderDropdown user={user} />
    ) : (
        <LoginButton />
    )
}
