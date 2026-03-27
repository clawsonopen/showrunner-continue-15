
import React from 'react';
import { useShowrunnerStore } from '../../store/showrunnerStore';
import { Loader2, Zap } from 'lucide-react';

const GlobalCookingOverlay: React.FC = () => {
    const { isGeneratingGlobal, globalGenerationTask } = useShowrunnerStore();

    if (!isGeneratingGlobal) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-10 duration-500">
            <div className="bg-panel/90 backdrop-blur-xl border border-accent/20 rounded-2xl p-4 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex items-center gap-4 min-w-[300px] border-l-4 border-l-accent">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/10 border border-accent/20 shrink-0">
                    <Loader2 className="w-5 h-5 text-accent animate-spin" />
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <Zap size={12} className="text-accent fill-accent shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-tighter text-accent truncate">AI Processing</span>
                    </div>
                    <h4 className="text-sm font-bold text-white leading-tight truncate">
                        {globalGenerationTask || "Deep Thinking..."}
                    </h4>
                    <p className="text-[10px] text-muted font-medium truncate">
                        Generation continues if you navigate away.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GlobalCookingOverlay;
