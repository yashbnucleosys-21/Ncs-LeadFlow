import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    console.log("Fetching Admins and Leads...");

    // 1. Get all Admin emails from your "User" table
    const { data: admins } = await supabase
      .from('User')
      .select('email')
      .eq('role', 'Admin');
    
    const adminEmails = admins?.map(a => a.email.trim()) || [];
    console.log("Found Admins:", adminEmails);

    // 2. Setup Date Math
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const day4 = new Date(); 
    day4.setDate(now.getDate() + 4);
    const day4Str = day4.toISOString().split('T')[0];

    // 3. Fetch Leads needing reminders from "Lead" table
    const { data: leads, error: dbError } = await supabase
      .from('Lead')
      .select('*')
      .or(`and(four_day_reminder_sent.eq.false,nextFollowUpDate.gte.${day4Str}T00:00:00,nextFollowUpDate.lte.${day4Str}T23:59:59),and(overdue_reminder_sent.eq.false,nextFollowUpDate.lt.${todayStr}T00:00:00)`);

    if (dbError) throw dbError;
    if (!leads || leads.length === 0) return new Response(JSON.stringify({ message: "No leads due" }));

    console.log(`Processing ${leads.length} leads...`);

    for (const lead of leads) {
      const isOverdue = new Date(lead.nextFollowUpDate) < new Date(todayStr);
      
      // Determine the assigned user's email
      let assigneeEmail = lead.assignee || "";
      if (assigneeEmail && !assigneeEmail.includes('@')) {
        assigneeEmail = `${assigneeEmail}@gmail.com`;
      }

      // 4. Create the Recipient List (Assignee + All Admins)
      // We use a Set to ensure we don't have duplicate emails
      const recipients = new Set([assigneeEmail, ...adminEmails]);
      
      // --- TESTING MODE: RIGHT NOW ONLY SEND TO YOU ---
      // Comment out the next line later when you verify your domain in Resend
      const finalRecipients = ["yashb.nucleosys@gmail.com"]; 
      // const finalRecipients = Array.from(recipients).filter(email => email !== "");
      
      console.log(`Sending email for ${lead.leadName} to:`, finalRecipients);

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'LeadFlow CRM <onboarding@resend.dev>',
          to: finalRecipients,
          subject: isOverdue ? `⚠️ OVERDUE: ${lead.leadName}` : `Upcoming Follow-up: ${lead.leadName}`,
          html: `
            <h3>Lead Reminder</h3>
            <p><strong>Lead Name:</strong> ${lead.leadName}</p>
            <p><strong>Scheduled Date:</strong> ${new Date(lead.nextFollowUpDate).toLocaleDateString()}</p>
            <p><strong>Assignee:</strong> ${lead.assignee}</p>
            <hr />
            <p>This notification was sent to the assignee and all administrators.</p>
          `
        })
      });

      if (res.ok) {
        const updateField = isOverdue ? { overdue_reminder_sent: true } : { four_day_reminder_sent: true };
        await supabase.from('Lead').update(updateField).eq('id', lead.id);
      } else {
        const err = await res.json();
        console.error("Resend Error:", err);
      }
    }

    return new Response(JSON.stringify({ status: 'complete' }));

  } catch (err) {
    console.error("Critical Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
})