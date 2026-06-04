/**
 * RC Checkout — creates Stripe checkout session and redirects
 * Called from pricing page: /api/rc/checkout?plan=pro or pro_plus
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')

const PRICES = {
  pro: 'price_1TDIgpRnilSLCu5EOWtwZ0Xs',       // $7.99 one-time
  pro_plus: 'price_1TDIhPRnilSLCu5EHeapabpe',   // $12.99/month
}

export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get('plan') as 'pro' | 'pro_plus' | null
  const priceId = plan ? PRICES[plan] : null

  if (!priceId) {
    return NextResponse.redirect('https://resumechiefz.com/pricing.html')
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: plan === 'pro_plus' ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://resumechiefz.com/app.html?upgraded=1',
      cancel_url: 'https://resumechiefz.com/pricing.html',
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    })

    return NextResponse.redirect(session.url ?? 'https://resumechiefz.com/pricing.html')
  } catch (err) {
    console.error('[RC Checkout]', err)
    return NextResponse.redirect('https://resumechiefz.com/pricing.html')
  }
}
