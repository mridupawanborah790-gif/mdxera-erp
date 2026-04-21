// Ensure Deno and Supabase function types are available
// FIX: Removed Deno-specific type reference to prevent errors in standard TypeScript environments.
// The `declare const Deno` below handles type-checking for the Deno global object.

// Fix: Add Deno declaration to allow type-checking in non-Deno environments.
declare const Deno: any;

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Razorpay from 'https://esm.sh/razorpay@2.8.6';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // This is needed for CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get the user from the access token
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { plan_id } = await req.json();
    if (!plan_id) {
      throw new Error('plan_id is required.');
    }

    // Initialize Razorpay with your secret keys from Supabase secrets
    const razorpay = new Razorpay({
      key_id: Deno.env.get('RAZORPAY_KEY_ID')!,
      key_secret: Deno.env.get('RAZORPAY_SECRET_KEY')!,
    });

    const subscriptionOptions = {
      plan_id: plan_id,
      total_count: 36, // Set a long duration for the subscription, e.g., 36 cycles.
      quantity: 1,
      customer_notify: 1, // Let Razorpay handle notifications
    };

    const subscription = await razorpay.subscriptions.create(subscriptionOptions);

    if (!subscription) {
      throw new Error('Failed to create subscription with Razorpay.');
    }

    // Create an admin client to interact with the database
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Insert a record into the new razorpay_subscriptions table
    const { error: insertError } = await supabaseAdmin
      .from('razorpay_subscriptions')
      .insert({
        user_id: user.id,
        subscription_id: subscription.id,
        plan_id: plan_id,
        status: subscription.status, // Should be 'created'
        customer_id: subscription.customer_id,
        next_due_on: new Date(subscription.charge_at * 1000).toISOString(),
      });

    if (insertError) {
      // If the database insert fails, cancel the Razorpay subscription to avoid dangling subscriptions.
      await razorpay.subscriptions.cancel(subscription.id);
      console.error('DB insert error:', insertError);
      throw new Error('Failed to save subscription record in database.');
    }
    
    // Return the new, unique subscription ID and the public key ID to the frontend
    return new Response(JSON.stringify({ 
      subscription_id: subscription.id,
      key_id: Deno.env.get('RAZORPAY_KEY_ID')!,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});