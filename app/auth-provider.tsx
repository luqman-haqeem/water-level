'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type User = {
    id: string
    name: string
}
type Token = {
    accessToken: string
    refreshToken: string
    expiresIn: number
}

type AuthContextType = {
    user: User | null
    loading: boolean
    login: (email: string) => Promise<void>
    logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<Token | null>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        const checkSession = async () => {
            try {
                const headers = new Headers()
                if (token) {
                    headers.append('Authorization', `Bearer ${token.accessToken}`)
                }
                const response = await fetch('/api/auth/session', { headers })

                if (response.ok) {
                    const data = await response.json()
                    setUser(data.user)
                }
            } catch (error) {
                console.error('Failed to check session:', error)
            } finally {
                setLoading(false)
            }
        }
        checkSession()
    }, [])

    const login = async (email: string) => {
        setLoading(true)
        try {
            const headers = new Headers()
            if (token) {
                headers.append('Authorization', `Bearer ${token.accessToken}`)
            }
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    ...headers, 'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email }),
            })
            if (response.ok) {
                const data = await response.json()
                setUser(data.user)
                setToken(data.token)

            } else {
                throw new Error('Login failed')
            }
        } catch (error) {
            console.log(error);

            console.error('Login error:', error)
            throw error
        } finally {
            setLoading(false)
        }
    }

    const logout = async () => {
        setLoading(true)
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
            setUser(null)
            setToken(null)
            router.push('/')
        } catch (error) {
            console.error('Logout error:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}

