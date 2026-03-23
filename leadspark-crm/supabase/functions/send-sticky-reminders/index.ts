import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: notes } = await supabase
    .from("sticky_notes")
    .select("*, leads(first_name, last_name)")
    .eq("is_reminder_sent", false)
    .lte("reminder_at", new Date().toISOString());

  if (!notes?.length) return new Response("No pending reminders.");

  const client = new SmtpClient();
  await client.connectTLS({
    hostname: "smtp.gmail.com",
    port: 587,
    username: Deno.env.get("GMAIL_USER")!,
    password: Deno.env.get("GMAIL_APP_PASSWORD")!,
  });

  for (const note of notes) {
    try {
      const leadInfo = note.leads ? `Linked Lead: ${note.leads.first_name} ${note.leads.last_name}` : "";
      
      await client.send({
        from: Deno.env.get("GMAIL_USER")!,
        to: note.email,
        subject: "⏰ Reminder from Nucleosys LeadFlow",
        content: `Reminder: ${note.content}\n${leadInfo}\nTime: ${note.reminder_at}`,
      });

      await supabase.from("sticky_notes").update({ is_reminder_sent: true }).eq("id", note.id);
    } catch (e) {
      console.error("Email failed for note:", note.id, e);
    }
  }

  await client.close();
  return new Response("Reminders processed");
});