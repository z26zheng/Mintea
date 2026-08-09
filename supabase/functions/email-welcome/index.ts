import { handler, json } from '../_shared/http.ts';
import { sendEmail } from '../_shared/email.ts';
import { welcomeEmail } from '../_shared/emailTemplates.ts';
import { requireCaller } from '../_shared/supabase.ts';

/**
 * Sends the signed-in user Mintea's welcome message.
 *
 * The recipient is always loaded from Supabase Auth rather than accepted from
 * the request, so this endpoint cannot become a general-purpose email relay.
 */
Deno.serve(
  handler(async (req) => {
    const caller = await requireCaller(req);
    const { data, error } = await caller.admin.auth.admin.getUserById(
      caller.userId,
    );

    if (error || !data.user?.email) {
      throw new Error('Could not load the account email address');
    }

    const content = welcomeEmail();
    const delivery = await sendEmail({
      to: data.user.email,
      subject: 'Welcome to Mintea',
      html: content.html,
      text: content.text,
      idempotencyKey: `welcome/${caller.userId}/v1`,
    });

    return json({ delivered: true, id: delivery.id });
  }),
);
