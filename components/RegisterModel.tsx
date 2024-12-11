import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import Image from 'next/image';
import { useToast } from "@/hooks/use-toast";
import useUserStore from '../lib/store';
import { createClient } from "@/utils/supabase/client";

interface RegisterModelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function RegisterModel({ open, onOpenChange }: RegisterModelProps) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const { register } = useUserStore();
    const { toast } = useToast();
    const supabase = createClient();

    const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus('loading');
        const form = e.currentTarget;
        const email = (form.elements.namedItem('email') as HTMLInputElement).value;
        const password = (form.elements.namedItem('password') as HTMLInputElement).value;
        const confirmPassword = (form.elements.namedItem('confirm-password') as HTMLInputElement).value;
        if (password !== confirmPassword) {
            setStatus('error');
            setMessage('Passwords do not match');
            return;
        }
        const { error } = await register(email, password);

        if (error) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'Registration failed');
        } else {
            toast({
                variant: "success",
                title: "Registration Successful",
                description: "Please check your email for verification link",
                duration: 2000,
            });
            onOpenChange(false);
        }
        setStatus('idle');
    };
    const handleSocialLogin = async (provider: 'google') => {
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
                    <DialogTitle>Create an account</DialogTitle>
                    <DialogDescription>Enter your email below to create your account</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-6">
                    <Button variant="outline" onClick={() => handleSocialLogin('google')}>
                        <Image src="/google-icon.svg" alt="Google" width={20} height={20} className="mr-2" />
                        Google
                    </Button>
                </div>
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                            Or continue with
                        </span>
                    </div>
                </div>
                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <Label htmlFor="register-email">Email</Label>
                        <Input id="register-email" name="email" type="email" placeholder="Enter your email" required />
                    </div>
                    <div>
                        <Label htmlFor="register-password">Password</Label>
                        <Input id="register-password" name="password" type="password" placeholder="Create a password" required />
                    </div>
                    <div>
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input id="confirm-password" type="password" placeholder="Confirm your password" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={status === 'loading'}>
                        {status === 'loading' ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Registering...
                            </>
                        ) : (
                            'Register'
                        )}
                    </Button>
                </form>
                {status === 'error' && (
                    <div className="flex items-center gap-2 text-red-600 mt-2">
                        <AlertCircle className="h-5 w-5" />
                        <span>{message}</span>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}