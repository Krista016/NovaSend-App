import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuthContext';
import { useAppContext } from '../../hooks/useAppContext';
import Card from '../ui/Card';
import Button from '../ui/Button';

const API_BASE = '';

const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const { setCurrentPage } = useAppContext();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Forgot password state
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotMsg, setForgotMsg] = useState('');
    const [forgotToken, setForgotToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [forgotError, setForgotError] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [emailVerified, setEmailVerified] = useState(false);
    const [resetDone, setResetDone] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password.');
            return;
        }

        setIsSubmitting(true);
        try {
            await login(email.trim(), password);
            setCurrentPage('Dashboard');
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotPassword = async () => {
        setForgotError('');
        setForgotMsg('');
        if (!forgotEmail.trim()) {
            setForgotError('Please enter your email address.');
            return;
        }
        setForgotLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail.trim() }),
            });
            const data = await res.json();
            if (data.reset_token) {
                setForgotToken(data.reset_token);
                setEmailVerified(true);
                setForgotMsg('Email verified! Enter your new password below.');
            } else {
                setForgotMsg(data.message || 'If an account exists, a reset link has been sent.');
            }
        } catch {
            setForgotError('Network error. Please try again.');
        } finally {
            setForgotLoading(false);
        }
    };

    const handleResetPassword = async () => {
        setForgotError('');
        if (!newPassword || newPassword.length < 6) {
            setForgotError('Password must be at least 6 characters.');
            return;
        }
        setForgotLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: forgotToken, new_password: newPassword }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setForgotMsg('Password reset successfully! You can now log in.');
                setResetDone(true);
                setForgotToken('');
                setNewPassword('');
            } else {
                setForgotError(data.message || 'Reset failed.');
            }
        } catch {
            setForgotError('Network error. Please try again.');
        } finally {
            setForgotLoading(false);
        }
    };

    const handleSignupClick = () => {
        setCurrentPage('Signup');
    };

    const closeForgotModal = () => {
        setShowForgotPassword(false);
        setForgotEmail('');
        setForgotMsg('');
        setForgotToken('');
        setNewPassword('');
        setForgotError('');
        setEmailVerified(false);
        setResetDone(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4 transition-colors duration-300">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold tracking-tight">
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]">
                            NovaSend
                        </span>
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
                        Sign in to your account to continue
                    </p>
                </div>

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm" role="alert">
                                {error}
                            </div>
                        )}

                        <div>
                            <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address</label>
                            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com" disabled={isSubmitting} autoComplete="email"
                                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--gradient-via)] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200" />
                        </div>

                        <div>
                            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••" disabled={isSubmitting} autoComplete="current-password"
                                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--gradient-via)] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200" />
                        </div>

                        <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
                            {isSubmitting ? (
                                <span className="flex items-center justify-center space-x-2">
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <span>Signing in...</span>
                                </span>
                            ) : ('Sign In')}
                        </Button>
                    </form>

                    <div className="mt-6 text-center space-y-2">
                        <p className="text-sm">
                            <button type="button" onClick={() => setShowForgotPassword(true)} disabled={isSubmitting}
                                className="text-gray-500 dark:text-gray-400 hover:text-[var(--gradient-via)] transition-colors">
                                Forgot your password?
                            </button>
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Don't have an account?{' '}
                            <button type="button" onClick={handleSignupClick} disabled={isSubmitting}
                                className="font-medium text-transparent bg-clip-text bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                                Create one
                            </button>
                        </p>
                    </div>
                </Card>
            </div>

            {/* Forgot Password Modal */}
            {showForgotPassword && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeForgotModal}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-200 dark:border-gray-700 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Reset Password</h2>

                        {forgotMsg && (
                            <div className="mb-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-sm">{forgotMsg}</div>
                        )}
                        {forgotError && (
                            <div className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">{forgotError}</div>
                        )}

                        {!emailVerified ? (
                            <>
                                <input type="email" placeholder="Your email address" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3" />
                                <button onClick={handleForgotPassword} disabled={forgotLoading}
                                    className="w-full px-4 py-2 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                                    {forgotLoading ? 'Verifying...' : 'Send Reset Token'}
                                </button>
                            </>
                        ) : !resetDone ? (
                            <>
                                <input type="password" placeholder="New password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3" />
                                <button onClick={handleResetPassword} disabled={forgotLoading}
                                    className="w-full px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50">
                                    {forgotLoading ? 'Resetting...' : 'Reset Password'}
                                </button>
                            </>
                        ) : (
                            <button onClick={() => { closeForgotModal(); setCurrentPage('Login'); }}
                                className="w-full px-4 py-2 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90">
                                Sign In
                            </button>
                        )}

                        <button onClick={closeForgotModal}
                            className="mt-3 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoginPage;