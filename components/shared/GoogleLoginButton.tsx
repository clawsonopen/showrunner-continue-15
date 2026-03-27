
import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useShowrunnerStore } from '../../store/showrunnerStore';
import { LogIn } from 'lucide-react';

const GoogleLoginButton: React.FC = () => {
    const { setUser } = useShowrunnerStore();

    const login = useGoogleLogin({
        // Removed the restricted generative-language scope to ensure basic login works.
        // If you want to use the user's account for AI calls, you must enable the 
        // Generative Language API in your Google Cloud Console and add the scope back.
        // scope: 'https://www.googleapis.com/auth/generative-language.retriever',
        onSuccess: async (tokenResponse) => {
            try {
                // Fetch user info from Google
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                const userInfo = await res.json();
                
                setUser({
                    id: userInfo.sub,
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    accessToken: tokenResponse.access_token
                });
            } catch (error) {
                console.error("Login failed:", error);
            }
        },
        onError: () => console.log('Login Failed'),
    });

    return (
        <button 
            onClick={() => login()}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-bold rounded-lg hover:bg-slate-200 transition-colors shadow-lg"
        >
            <LogIn size={18} />
            <span>Login with Google</span>
        </button>
    );
};

export default GoogleLoginButton;
