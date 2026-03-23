import React, { useState, useEffect, useRef } from 'react';
import { useStickyNotes } from '../../hooks/useStickyNotes';
import { stickyNotesApi } from '../../lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { X, Clock, User, Bell, StickyNote as StickyNoteIcon, Trash2, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

export const StickyNotesPanel = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { notes, refresh } = useStickyNotes();
    const [form, setForm] = useState({ note: '', remind_at: '', lead_id: '' });
    const [remindBefore, setRemindBefore] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [localNotes, setLocalNotes] = useState(notes);
    const panelRef = useRef<HTMLDivElement>(null);

    // Sync local notes with server notes when they are updated/fetched
    useEffect(() => {
        setLocalNotes(notes);
    }, [notes]);

    // Accessibility: ESC to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // --- UPGRADE: Handle Form Reset (from Code B) ---
    const handleClearForm = () => {
        setForm({ note: '', remind_at: '', lead_id: '' });
        setRemindBefore(0);
        toast.info("Form cleared");
    };

    // --- UPGRADE: Handle Delete with Optimistic UI (from Code B) ---
    const handleDelete = async (id: string) => {
        const previousNotes = [...localNotes];
        setLocalNotes(localNotes.filter(n => n.id !== id));

        try {
            await stickyNotesApi.deleteNote(id);
            toast.success("Note removed");
            refresh();
        } catch (error) {
            setLocalNotes(previousNotes);
            toast.error("Failed to delete note");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // 1. Basic Validation
        if (form.note.trim().length < 5) {
            toast.error("Note must be at least 5 characters");
            return;
        }
        if (!form.remind_at) {
            toast.error("Please select a date and time");
            return;
        }

        const targetDate = new Date(form.remind_at);
        if (targetDate < new Date()) {
            toast.error("Cannot set a reminder in the past");
            return;
        }

        setIsSubmitting(true);

        // 2. Calculate final reminder time (Target time minus the "Remind me before" offset)
        const finalRemindAt = new Date(targetDate.getTime() - remindBefore * 60000).toISOString();

        // 3. Prepare Payload (Ensuring Key Alignment and UUID safety)
        const payload = {
            content: form.note,
            reminder_at: finalRemindAt,
            // UUID SAFETY: Convert empty string to null so the DB doesn't throw a format error
            lead_id: form.lead_id && form.lead_id.trim() !== '' ? form.lead_id : null,
            color: 'yellow'
        };

        // 4. Optimistic UI Update
        const optimisticNote = {
            id: crypto.randomUUID(),
            ...payload,
            is_reminder_sent: false,
            created_at: new Date().toISOString()
        };
        setLocalNotes(prev => [optimisticNote, ...prev]);

        try {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) throw new Error("Authentication failed. Please log in again.");

            // API Call
            await stickyNotesApi.createNote({
                ...payload,
                user_id: user.id,
                email: user.email,
            });

            toast.success("Reminder scheduled!");
            setForm({ note: '', remind_at: '', lead_id: '' });
            refresh(); // Refresh background data to sync IDs
        } catch (error: any) {
            // ROLLBACK: Revert to the last known good state from server
            setLocalNotes(notes);
            
            // LOGGING: Crucial for debugging schema/UUID mismatches
            console.error("Sticky Notes Submission Error:", error.message || error);
            
            toast.error(error.message || "Failed to create reminder. Check console for details.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop for click-outside-to-close */}
            <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" onClick={onClose} />
            
            <div 
                ref={panelRef}
                className="fixed right-0 top-0 h-full w-80 md:w-96 bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300"
            >
                {/* STICKY HEADER */}
                <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-bold text-gray-800">Sticky Notes</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-6">
                    {/* FORM SECTION - UPGRADE: Added shadow-inner (from Code B) */}
                    <form onSubmit={handleSubmit} className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Note Content</label>
                            <textarea
                                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[80px] bg-white"
                                placeholder="What's the reminder for?"
                                value={form.note}
                                onChange={e => setForm({ ...form, note: e.target.value })}
                                required
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date & Time</label>
                                <input
                                    type="datetime-local"
                                    className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    value={form.remind_at}
                                    onChange={e => setForm({ ...form, remind_at: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Remind Me</label>
                                <select 
                                    className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white outline-none"
                                    value={remindBefore}
                                    onChange={(e) => setRemindBefore(Number(e.target.value))}
                                >
                                    <option value={0}>At time of event</option>
                                    <option value={15}>15 minutes before</option>
                                    <option value={30}>30 minutes before</option>
                                    <option value={60}>1 hour before</option>
                                    <option value={120}>2 hours before</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lead UUID (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="Enter valid Lead UUID..."
                                    className="w-full border border-gray-200 rounded-lg p-2 text-sm outline-none bg-white font-mono text-[11px]"
                                    value={form.lead_id}
                                    onChange={e => setForm({ ...form, lead_id: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* UPGRADE: Button Layout with Clear option (from Code B) */}
                        <div className="flex gap-2 pt-2">
                            <button 
                                type="button"
                                onClick={handleClearForm}
                                className="flex-1 py-2 rounded-lg font-bold text-xs bg-white border border-gray-200 text-gray-500 hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                            >
                                <Eraser className="w-3 h-3" /> Clear
                            </button>
                            <button 
                                disabled={isSubmitting}
                                className={cn(
                                    "flex-[2] py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm active:scale-[0.98]",
                                    isSubmitting ? "bg-gray-300 cursor-not-allowed text-gray-500" : "bg-blue-600 hover:bg-blue-700 text-white"
                                )}
                            >
                                {isSubmitting ? "Saving..." : "Create Reminder"}
                            </button>
                        </div>
                    </form>

                    {/* LIST SECTION */}
                    <div className="space-y-3 pb-10">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recent Notes</h3>
                            <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-[10px]">{localNotes.length}</span>
                        </div>
                        
                        {localNotes.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl">
                                <StickyNoteIcon className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                <p className="text-xs text-gray-400">No active reminders.<br/>Your scheduled notes will appear here.</p>
                            </div>
                        ) : (
                            localNotes.map(n => (
                                <div 
                                    key={n.id} 
                                    className={cn(
                                        "p-4 border rounded-xl transition-all relative group shadow-sm", // UPGRADE: Added shadow-sm (from Code B)
                                        n.is_reminder_sent ? 'bg-gray-50 border-gray-200 opacity-75' : 'bg-yellow-50/60 border-yellow-100'
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className={cn(
                                            "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                                            n.is_reminder_sent ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'
                                        )}>
                                            {n.is_reminder_sent ? 'Sent' : 'Scheduled'}
                                        </div>
                                        {/* UPGRADE: DELETE BUTTON (from Code B) */}
                                        <button 
                                            onClick={() => handleDelete(n.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 hover:text-red-600 text-gray-400 rounded-md transition-all"
                                            title="Delete note"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    
                                    <p className="text-sm text-gray-700 leading-snug mb-3 font-medium">
                                        {n.content}
                                    </p>
                                    
                                    {/* UPGRADE: Enhanced bottom info layout and truncated Lead ID (from Code B) */}
                                    <div className="space-y-1.5 pt-2 border-t border-black/[0.03] flex justify-between items-end">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <Clock className="w-3 h-3" />
                                                <span className="text-[10px] font-medium">
                                                    {new Date(n.reminder_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                </span>
                                            </div>
                                            {n.lead_id && (
                                                <div className="flex items-center gap-2 text-blue-600">
                                                    <User className="w-3 h-3" />
                                                    <span className="text-[9px] font-bold truncate max-w-[120px]">
                                                        Lead ID: {n.lead_id.slice(0, 8)}...
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-[9px] text-gray-300 font-mono">
                                            {new Date(n.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};