import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // --- 1. DATE CALCULATION (Exact Strings for YYYY-MM-DD) ---
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // e.g., "2026-01-16"
  
  const targetDay = new Date();
  targetDay.setDate(today.getDate() + 4);
  const targetDayStr = targetDay.toISOString().split('T')[0]; // e.g., "2026-01-20"
  
  const nextDayAfterTarget = new Date();
  nextDayAfterTarget.setDate(targetDay.getDate() + 1);
  const nextDayAfterTargetStr = nextDayAfterTarget.toISOString().split('T')[0]; // e.g., "2026-01-21"

  console.log(`Scan started. Overdue < ${todayStr} | Upcoming is exactly ${targetDayStr}`);

  // --- 2. FETCH LEADS ---
  
  // Condition A: Upcoming (Leads falling anywhere within the 24 hours of targetDay)
  const { data: upcomingLeads, error: errU } = await supabase
    .from("leads")
    .select("id, first_name, last_name, next_follow_up_date, assigned_to_email")
    .eq("upcoming_reminder_sent", false)
    .gte("next_follow_up_date", targetDayStr) // Start of target day
    .lt("next_follow_up_date", nextDayAfterTargetStr); // Before start of next day

  // Condition B: Overdue (Leads with dates strictly before today's start)
  const { data: overdueLeads, error: errO } = await supabase
    .from("leads")
    .select("id, first_name, last_name, next_follow_up_date, assigned_to_email")
    .eq("overdue_reminder_sent", false)
    .lt("next_follow_up_date", todayStr);

  if (errU || errO) {
    console.error("DB Query Error:", errU || errO);
    return new Response("Database error", { status: 500 });
  }

  console.log(`Query Results: ${upcomingLeads?.length || 0} upcoming, ${overdueLeads?.length || 0} overdue.`);

  // --- 3. FETCH ADMINS ---
  const { data: adminProfiles } = await supabase
    .from("profiles") // Ensure this matches your admin table (e.g., profiles or user_roles)
    .select("email")
    .eq("role", "admin");

  const adminEmails = adminProfiles?.map(a => a.email).filter(Boolean) || [];

  // Exit if nothing to do
  if (!upcomingLeads?.length && !overdueLeads?.length) {
    return new Response(JSON.stringify({ message: "No reminders found for today." }), { status: 200 });
  }

  // --- 4. SMTP CONFIGURATION ---
  const client = new SmtpClient();
  
  try {
    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 587,
      username: Deno.env.get("GMAIL_USER")!,
      password: Deno.env.get("GMAIL_APP_PASSWORD")!,
    });

    const sendEmail = async (to: string, subject: string, content: string) => {
      if (!to) return;
      await client.send({
        from: Deno.env.get("GMAIL_USER")!,
        to,
        subject,
        content,
      });
    };

    // --- 5. PROCESS UPCOMING (4 DAYS BEFORE) ---
    for (const lead of (upcomingLeads || [])) {
      const name = `${lead.first_name} ${lead.last_name}`;
      const subject = `📅 Upcoming Follow-up: ${name}`;
      const msg = `Reminder: You have a follow-up scheduled with ${name} on ${new Date(lead.next_follow_up_date).toLocaleDateString()} (4 days from now).`;

      await sendEmail(lead.assigned_to_email, subject, msg);
      
      for (const admin of adminEmails) {
        await sendEmail(admin, `[Admin] Upcoming Follow-up: ${name}`, `Assignee ${lead.assigned_to_email} has a follow-up in 4 days with ${name}.`);
      }

      await supabase.from("leads").update({ upcoming_reminder_sent: true }).eq("id", lead.id);
      console.log(`Sent upcoming reminder for lead ID: ${lead.id}`);
    }

    // --- 6. PROCESS OVERDUE ---
    for (const lead of (overdueLeads || [])) {
      const name = `${lead.first_name} ${lead.last_name}`;
      const subject = `🚨 OVERDUE: Follow-up with ${name}`;
      const msg = `ATTENTION: Your follow-up with ${name} was due on ${new Date(lead.next_follow_up_date).toLocaleDateString()} and is now overdue. Please action this immediately.`;

      await sendEmail(lead.assigned_to_email, subject, msg);
      
      for (const admin of adminEmails) {
        await sendEmail(admin, `[Admin Alert] Overdue Follow-up: ${name}`, `Assignee ${lead.assigned_to_email} missed a follow-up with ${name} on ${lead.next_follow_up_date}.`);
      }

      await supabase.from("leads").update({ overdue_reminder_sent: true }).eq("id", lead.id);
      console.log(`Sent overdue reminder for lead ID: ${lead.id}`);
    }

  } catch (error) {
    console.error("Processing Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  } finally {
    try { await client.close(); } catch(e) { /* ignore close errors */ }
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});