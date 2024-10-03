import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { createClient } from '@supabase/supabase-js';
import useUserStore from '../lib/store';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseKey);

interface LoginModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function LoginModal({ open, onOpenChange }: LoginModalProps) {
    const { login } = useUserStore();
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [message, setMessage] = useState('')

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus('loading');

        const form = e.currentTarget;
        const email = (form.elements.namedItem('email') as HTMLInputElement).value;
        const password = (form.elements.namedItem('password') as HTMLInputElement).value;

        await login(email, password);

        setStatus('idle');
        onOpenChange(false);
    };

    const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple') => {
        const { error } = await supabase.auth.signInWithOAuth({ provider });
        if (error) {
            console.error(`Error logging in with ${provider}:`, error.message);
        } else {
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Login</DialogTitle>
                    <DialogDescription>Enter your credentials to log in</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" placeholder="Enter your email" required />
                    </div>
                    <div>
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" name="password" type="password" placeholder="Enter your password" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={status === 'loading'}>
                        {status === 'loading' ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Logging in...
                            </>
                        ) : (
                            'Login'
                        )}
                    </Button>
                </form>
                {status === 'error' && (
                    <div className="flex items-center gap-2 text-red-600 mt-2">
                        <AlertCircle className="h-5 w-5" />
                        <span>{message}</span>
                    </div>
                )}
                <Separator className="my-4" />
                <div className="space-y-2">
                    <Button onClick={() => handleSocialLogin('google')} variant="outline" className="w-full">
                        Login with Google
                    </Button>
                    {/* <Button onClick={() => handleSocialLogin('facebook')} variant="outline" className="w-full">
                        Login with Facebook
                    </Button>
                    <Button onClick={() => handleSocialLogin('apple')} variant="outline" className="w-full">
                        Login with Apple
                    </Button> */}
                </div>
            </DialogContent>
        </Dialog>
    );
}