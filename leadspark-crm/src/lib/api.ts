import { supabase } from "@/integrations/supabase/client";

export const stickyNotesApi = {
    async getNotes() {
        const { data, error } = await supabase
            // Cast 'sticky_notes' as any to bypass the missing type error
            .from('sticky_notes' as any)
            .select('*, leads(first_name, last_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async createNote(payload: { content: string, reminder_at: string, lead_id?: string, user_id?: string, email?: string }) {
        const { data, error } = await supabase
            .from('sticky_notes' as any)
            .insert([{
                content: payload.content,
                reminder_at: payload.reminder_at,
                lead_id: payload.lead_id || null, // Ensure UUID safety
                user_id: payload.user_id,
                email: payload.email,
                is_reminder_sent: false,
                color: 'yellow'
            }]);

        if (error) throw error;
        return data;
    },
    async deleteNote(id: string) {
        const { error } = await supabase
            .from('sticky_notes' as any)
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
};