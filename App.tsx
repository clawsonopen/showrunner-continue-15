
import React, { useState, useEffect } from 'react';
import { useShowrunnerStore } from './store/showrunnerStore';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import StoryBible from './pages/StoryBible';
import Scriptwriter from './pages/Scriptwriter';
import ArtDept from './pages/ArtDept';
import TheStudio from './pages/TheStudio';
import SoundStage from './pages/SoundStage';
import Settings from './pages/Settings';
import { Page } from './types';
import { BrainCircuit, Key } from 'lucide-react';
import GoogleLoginButton from './components/shared/GoogleLoginButton';

export default function App() {
  const { project, loadAutosave, isLoaded, user, apiKeys } = useShowrunnerStore();
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [hasKey, setHasKey] = useState<boolean>(true);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);

  useEffect(() => {
    loadAutosave();
  }, [loadAutosave]);

  useEffect(() => {
    const checkKey = async () => {
      let keySelected = false;
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        keySelected = await window.aistudio.hasSelectedApiKey();
      } else if (user?.accessToken || apiKeys['google_native']) {
        keySelected = true;
      }
      setHasKey(keySelected);
      setIsCheckingKey(false);
    };
    checkKey();
  }, [user, apiKeys]);

  // Listen for custom event to reset key state if API fails
  useEffect(() => {
    const handleResetKey = () => setHasKey(false);
    window.addEventListener('reset-api-key', handleResetKey);
    return () => window.removeEventListener('reset-api-key', handleResetKey);
  }, []);

  useEffect(() => {
    if (!project && currentPage !== 'Dashboard' && currentPage !== 'Settings') {
      setTimeout(() => setCurrentPage('Dashboard'), 0);
    }
  }, [project, currentPage]);

  const handleSelectKey = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Assume success to mitigate race condition
    } else {
      // If NOT in AI Studio, take them to the Settings page where they can enter their key
      setHasKey(true);
      setCurrentPage('Settings');
    }
  };

  if (isCheckingKey || !isLoaded) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-base text-primary">
              <BrainCircuit className="w-12 h-12 animate-spin mb-4 text-accent" />
              <p className="text-muted text-sm font-medium">Initializing Showrunner AI...</p>
          </div>
      );
  }

  if (!hasKey) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-base text-primary p-6">
        <div className="max-w-md w-full bg-panel border border-subtle rounded-xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-accent/20 text-accent rounded-full flex items-center justify-center mx-auto mb-6">
            <Key size={32} />
          </div>
          <h1 className="text-2xl font-black mb-4">API Key Required</h1>
          <p className="text-muted text-sm mb-6">
            To use the advanced models, you need a Google Cloud API key or a Google Account.
          </p>
          <div className="flex flex-col gap-3">
              <button 
                onClick={handleSelectKey}
                className="w-full py-3 bg-panel border-2 border-subtle text-primary font-bold rounded-lg hover:border-accent transition-colors flex items-center justify-center gap-2"
              >
                <Key size={18} /> Select API Key
              </button>
              <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-subtle" />
                  <span className="text-[10px] text-muted uppercase font-bold shrink-0">or use free tier</span>
                  <div className="flex-1 h-px bg-subtle" />
              </div>
              <div className="flex justify-center">
                  <GoogleLoginButton />
              </div>
          </div>
          <p className="text-xs text-muted mt-4">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              Learn more about billing
            </a>
          </p>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    if (!project) {
        if (currentPage === 'Settings') return <Settings />;
        return <Dashboard />;
    }
    switch (currentPage) {
      case 'Dashboard':
        return <Dashboard />;
      case 'Story Bible':
        return <StoryBible setCurrentPage={setCurrentPage} />;
      case 'Scriptwriter':
        return <Scriptwriter setCurrentPage={setCurrentPage} />;
      case 'Art Dept':
        return <ArtDept setCurrentPage={setCurrentPage} />;
      case 'The Studio':
        return <TheStudio setCurrentPage={setCurrentPage} />;
      case 'Sound Stage':
        return <SoundStage setCurrentPage={setCurrentPage} />;
      case 'Settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <MainLayout currentPage={currentPage} setCurrentPage={setCurrentPage}>
      {renderPage()}
    </MainLayout>
  );
}
