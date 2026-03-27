
import React from 'react';
import { useShowrunnerStore } from '../../store/showrunnerStore';
import { Info, Zap, Image as ImageIcon, Layout, Clock, Activity, AlertTriangle } from 'lucide-react';

const QuotaTracker: React.FC = () => {
    const { user, usageStats } = useShowrunnerStore();

    const getCount = (id: string, res?: string) => {
        if (!usageStats || !usageStats.modelCounts) return 0;
        const key = res ? `${id}:${res}` : id;
        return usageStats.modelCounts[key] || 0;
    };

    const textQuotas = [
        { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', rpm: '15 RPM', rpd: '1,000 RPD', context: '1M' },
        { id: 'gemini-3.1-flash-preview', name: 'Gemini 3.1 Flash', rpm: '10 RPM', rpd: '250 RPD', context: '1M' },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', rpm: '2 RPM', rpd: '50 RPD', context: '2M' },
    ];

    const imageQuotas = [
        { model: 'gemini-3.1-flash-image-preview', res: '1K', label: '1K (1024px)', flash: '~20 / day', pro: '2 / day', notes: 'Free Tier' },
        { model: 'gemini-3-pro-image-preview', res: '1K', label: '1K (1024px)', flash: '-', pro: '2 / day', notes: 'Pro' },
        { model: 'gemini-3.1-flash-image-preview', res: '2K', label: '2K (2048px)', flash: 'Tier 1 Only', pro: '0 / day', notes: 'Advanced' },
        { model: 'gemini-3.1-flash-image-preview', res: '4K', label: '4K (4096px)', flash: 'Paid Only', pro: 'Paid Only', notes: 'Hi-Res' },
    ];

    const totalText = textQuotas.reduce((acc, q) => acc + getCount(q.id), 0);
    const totalImage = imageQuotas.reduce((acc, q) => acc + getCount(q.model, q.res), 0);

    return (
        <div className="flex flex-col gap-6 p-4 bg-panel border border-subtle rounded-xl max-w-2xl mx-auto shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between border-b border-subtle pb-4">
                <div className="flex items-center gap-2">
                    <Activity className="text-accent w-5 h-5" />
                    <h2 className="text-lg font-black uppercase tracking-tighter">System Quota Status</h2>
                </div>
                {user && (
                    <div className="flex items-center gap-2 px-2 py-1 bg-accent/10 border border-accent/20 rounded text-[10px] text-accent font-bold uppercase">
                        Active Session: {user.name}
                    </div>
                )}
            </div>

            {/* Billing Warning */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                    <div className="space-y-1">
                        <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wide">Free Tier Notice</h4>
                        <p className="text-[11px] text-amber-100/80 leading-relaxed">
                            Free image generation is <strong>only</strong> guaranteed for <strong>Nano Banana 2</strong> at <strong>1K Resolution</strong> (~20 / day). 
                            Generating images with the Pro model or at 2K/4K resolutions may require a linked billing account or incur costs. 
                            Text models are all currently within free tier limits.
                        </p>
                    </div>
                </div>
            </div>

            {/* Note about tracking */}
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/20 rounded text-[10px] text-blue-300 italic">
                <Info size={14} className="shrink-0" />
                This counter tracks activity within Showrunner only. It does not reflect global AI Studio usage.
            </div>

            {/* Text Generation Quotas */}
            <section>
                <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <h3 className="text-sm font-bold text-primary">Text & Logic Usage</h3>
                    </div>
                    <span className="text-[10px] font-bold text-muted bg-surface px-2 py-0.5 rounded border border-subtle">
                        TOTAL: {totalText}
                    </span>
                </div>
                <div className="overflow-hidden border border-subtle rounded-lg">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="bg-base/50 text-muted uppercase font-bold text-[10px]">
                                <th className="p-2 border-b border-subtle">Model</th>
                                <th className="p-2 border-b border-subtle">Daily Limit</th>
                                <th className="p-2 border-b border-subtle">Used (App)</th>
                                <th className="p-2 border-b border-subtle text-right">Context</th>
                            </tr>
                        </thead>
                        <tbody>
                            {textQuotas.map((row) => (
                                <tr key={row.id} className="hover:bg-accent/5 transition-colors border-b border-subtle/50 last:border-0 text-primary-text">
                                    <td className="p-2 font-medium">{row.name}</td>
                                    <td className="p-2 text-muted">{row.rpd}</td>
                                    <td className="p-2">
                                        <span className={`px-2 py-0.5 rounded font-mono text-xs ${getCount(row.id) > 0 ? 'bg-accent/20 text-accent font-bold' : 'bg-neutral-800 text-muted'}`}>
                                            {getCount(row.id)}
                                        </span>
                                    </td>
                                    <td className="p-2 text-right font-mono text-accent">{row.context}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Image Generation Quotas */}
            <section>
                <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-purple-500" />
                        <h3 className="text-sm font-bold text-primary">Image Production Usage</h3>
                    </div>
                    <span className="text-[10px] font-bold text-muted bg-surface px-2 py-0.5 rounded border border-subtle">
                        TOTAL: {totalImage}
                    </span>
                </div>
                <div className="overflow-hidden border border-subtle rounded-lg">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="bg-base/50 text-muted uppercase font-bold text-[10px]">
                                <th className="p-2 border-b border-subtle">Configuration</th>
                                <th className="p-2 border-b border-subtle">Daily Limit</th>
                                <th className="p-2 border-b border-subtle">Used (App)</th>
                                <th className="p-2 border-b border-subtle text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {imageQuotas.map((row, idx) => (
                                <tr key={idx} className="hover:bg-accent/5 transition-colors border-b border-subtle/50 last:border-0 text-primary-text">
                                    <td className="p-2">
                                        <div className="font-medium">{row.label}</div>
                                        <div className="text-[9px] text-muted uppercase tracking-tighter opacity-60">{row.model === 'gemini-3.1-flash-image-preview' ? 'Banana 2' : 'Banana Pro'}</div>
                                    </td>
                                    <td className="p-2 text-muted italic">
                                        {row.model === 'gemini-3.1-flash-image-preview' ? row.flash : row.pro}
                                    </td>
                                    <td className="p-2">
                                        <span className={`px-2 py-0.5 rounded font-mono text-xs ${getCount(row.model, row.res) > 0 ? 'bg-accent/20 text-accent font-bold' : 'bg-neutral-800 text-muted'}`}>
                                            {getCount(row.model, row.res)}
                                        </span>
                                    </td>
                                    <td className="p-2 text-right">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${row.notes === 'Free Tier' ? 'border-green-500/20 text-green-400 bg-green-500/5' : 'border-subtle text-muted'}`}>
                                            {row.notes}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-4 text-[10px] text-muted italic flex items-center gap-1">
                    <Clock size={12} className="shrink-0 text-accent" />
                    Usage counters reset daily at midnight. Last Reset: {usageStats.lastResetDate}
                </p>
            </section>
        </div>
    );
};

export default QuotaTracker;
