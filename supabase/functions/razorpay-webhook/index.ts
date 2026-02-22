// Ensure Deno and Supabase function types are available
// FIX: Removed Deno-specific type reference to prevent errors in standard TypeScript environments.
// The `declare const Deno` below handles type-checking for the Deno global object.

// Fix: Add Deno declaration to allow type-checking in non-Deno environments.
declare const Deno: any;

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Verifies the Razorpay webhook signature using Web Crypto API available in Deno.
 * @param body The raw request body string.
 * @param signature The 'x-razorpay-signature' header value.
 * @param secret The webhook secret from your environment variables.
 * @returns A promise that resolves to true if the signature is valid, false otherwise.
 */
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  
  // Convert the ArrayBuffer signature to a hex string for comparison.
  const hash = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hash === signature;
}

// Maps Razorpay Plan IDs back to the app's internal plan names.
// NOTE: These MUST match the IDs used in the Billing.tsx page.
const PLAN_ID_MAP = {
    'plan_STARTER_MONTHLY': 'starter',
    'plan_PRO_6MONTHLY': 'pro',
    'plan_BUSINESS_YEARLY': 'business'
};

serve(async (req) => {
  // Handle CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  // Securely verify the webhook signature.
  const signature = req.headers.get('x-razorpay-signature');
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  const body = await req.text(); // Read body once as text for verification.

  if (!signature || !secret) {
    console.error('Webhook signature or secret is missing.');
    return new Response('Signature or secret missing', { status: 400 });
  }
  
  const isVerified = await verifySignature(body, signature, secret);
  if (!isVerified) {
    console.error('Invalid webhook signature.');
    return new Response('Invalid signature', { status: 401 });
  }

  try {
    const payload = JSON.parse(body);
    const event = payload.event;
    const subscriptionEntity = payload.payload.subscription?.entity;

    if (!subscriptionEntity) {
      console.log('Webhook event without a subscription entity. Acknowledging.');
      return new Response('ok', { status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const subscriptionId = subscriptionEntity.id;

    // Find the user associated with this subscription
    const { data: subRecord, error: subRecordError } = await supabaseAdmin
      .from('razorpay_subscriptions')
      .select('user_id')
      .eq('subscription_id', subscriptionId)
      .single();

    if (subRecordError || !subRecord) {
      console.error(`Webhook error: Could not find user for subscription_id ${subscriptionId}. Error: ${subRecordError?.message}`);
      // Acknowledge to prevent retries, but log the issue.
      return new Response('Subscription record not found but acknowledged', { status: 200 });
    }
    const userId = subRecord.user_id;

    switch (event) {
      case 'subscription.charged': {
        const razorpayPlanId = subscriptionEntity.plan_id;
        const subscriptionPlan = PLAN_ID_MAP[razorpayPlanId as keyof typeof PLAN_ID_MAP];
        if (!subscriptionPlan) {
          console.warn(`Webhook received for unknown plan_id: ${razorpayPlanId}`);
          break;
        }
        
        // Update our subscription record
        const { error: subUpdateError } = await supabaseAdmin
          .from('razorpay_subscriptions')
          .update({
            status: 'active',
            next_due_on: new Date(subscriptionEntity.charge_at * 1000).toISOString(),
          })
          .eq('subscription_id', subscriptionId);
        if (subUpdateError) throw subUpdateError;

        // Update the user's profile for quick access
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({
            subscription_plan: subscriptionPlan,
            subscription_id: subscriptionId,
            subscription_status: 'active',
          })
          .eq('user_id', userId);
        if (profileUpdateError) throw profileUpdateError;
        
        console.log(`Successfully charged subscription for user ${userId} to plan ${subscriptionPlan}.`);
        break;
      }

      case 'subscription.cancelled':
      case 'subscription.halted': { // Halted means payment failed
        const newStatus = event === 'subscription.cancelled' ? 'cancelled' : 'past_due';
        
        // Update our subscription record
        const { error: subUpdateError } = await supabaseAdmin
          .from('razorpay_subscriptions')
          .update({ status: newStatus })
          .eq('subscription_id', subscriptionId);
        if (subUpdateError) throw subUpdateError;

        // Update the user's profile
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({ subscription_status: newStatus })
          .eq('user_id', userId);
        if (profileUpdateError) throw profileUpdateError;
        
        console.log(`Subscription ${subscriptionId} for user ${userId} is now ${newStatus}.`);
        break;
      }

      case 'subscription.completed': {
        // Update our subscription record
        const { error: subUpdateError } = await supabaseAdmin
          .from('razorpay_subscriptions')
          .update({ status: 'completed' })
          .eq('subscription_id', subscriptionId);
        if (subUpdateError) throw subUpdateError;

        // Update the user's profile
        const { error: profileUpdateError } = await supabaseAdmin
          .from('profiles')
          .update({ subscription_status: 'completed' })
          .eq('user_id', userId);
        if (profileUpdateError) throw profileUpdateError;

        console.log(`Subscription ${subscriptionId} for user ${userId} has completed.`);
        break;
      }
      
      default:
        console.log(`Received unhandled Razorpay event: ${event}`);
    }

    // Acknowledge receipt to Razorpay to prevent retries.
    return new Response('ok', { status: 200 });

  } catch (error) {
    console.error('Webhook processing error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});