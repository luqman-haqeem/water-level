import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import Image from 'next/image';
import Link from "next/link"
import RegisterModel from './RegisterModel';
import { useToast } from "@/hooks/use-toast";
import { useAuthActions } from "@convex-dev/auth/react";

interface LoginModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function LoginModal({ open, onOpenChange }: LoginModalProps) {
    const { signIn } = useAuthActions();
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [showRegisterModal, setShowRegisterModal] = useState(false)
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setStatus('loading');

        const form = e.currentTarget;
        const email = (form.elements.namedItem('email') as HTMLInputElement).value;

        try {
            await signIn("resend", { email });
            setStatus('idle');
            onOpenChange(false);
            toast({
                variant: "default",
                title: "Check Your Email",
                description: "We've sent you a login link. Please check your inbox and follow the instructions.",
                duration: 5000,
            });
        } catch (error) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'Login failed');
        }
    };

    const handleSocialLogin = async (provider: 'google') => {
        try {
            await signIn("google");
            onOpenChange(false);
        } catch (error) {
            console.error(`Error logging in with ${provider}:`, error);
            setStatus('error');
            setMessage('Google login failed');
        }
    };
    const openRegisterDialog = async () => {
        onOpenChange(false)
        setShowRegisterModal(true)

    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>

                        <DialogTitle>Login</DialogTitle>
                    </DialogHeader>


                    <Button variant="outline" onClick={() => handleSocialLogin('google')} >
                        <Image src="/google-icon.svg" alt="Github" width={20} height={20} className="mr-2" />
                        Login with Google
                    </Button>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                                Or continue with email
                            </span>
                        </div>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" placeholder="Enter your email" required />
                        </div>
                        {/* <div>
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" name="password" type="password" placeholder="Enter your password" required />
                        </div> */}
                        <Button type="submit" className="w-full" disabled={status === 'loading'}>
                            {status === 'loading' ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Logging in...
                                </>
                            ) : (
                                'Send Login Link'
                            )}
                        </Button>
                    </form>

                    <p className="text-sm text-gray-400">
                        We&apos;ll email you a secure, one-click login link - no password needed!
                    </p>
                    {status === 'error' && (
                        <div className="flex items-center gap-2 text-red-600 mt-2">
                            <AlertCircle className="h-5 w-5" />
                            <span>{message}</span>
                        </div>
                    )}
                    {/* <div className="mt-4 text-center text-sm">
                        Don&apos;t have an account?{" "}
                        <Link href="#" className="underline" onClick={() => openRegisterDialog()}>
                            Sign up
                        </Link>
                    </div> */}

                </DialogContent>
            </Dialog>
            <RegisterModel open={showRegisterModal} onOpenChange={setShowRegisterModal} />
        </>

    );
}