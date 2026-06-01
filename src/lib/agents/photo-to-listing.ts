import { slack } from '../slack'
/**
 * Photo-to-eBay Listing Pipeline — full automation
 * Upload a card photo → Claude Vision reads it → Lister formats listing → Posts to eBay
 *
 * Pipeline:
 * 1. Accept image (base64 or URL) from voice command / mobile upload
 * 2. Claude Vision identifies: player, year, brand, set, parallel, condition, card number
 * 3. formatListing() generates title + description + suggested price
 * 4. Post to eBay via Trading API (AddItem)
 * 5. Return listing URL to user via Slack
 *
 * Also works as "draft mode" — generates the listing but doesn't post until approved
 */
import Anthropic from '@anthropic-ai/sdk'
import { formatListing, CardInput, CardListing } from './lister'
import { supabaseAdmin } from '../supabase/client'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const EBAY_TOKEN = process.env.EBAY_USER_TOKEN
const TOKEN = process.env.SLACK_BOT_TOKEN


// ── Step 1: Vision — read the card from a photo ─────────────────────────────

export async function identifyCardFromImage(imageBase64: string, mimeType = 'image/jpeg'): Promise<CardInput> {
  const msg = await claude.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 },
        },
        {
          type: 'text',
          text: `You are a sports card expert. Identify every detail visible on this card.

Extract:
- player: full name
- year: card year (look at bottom or corner)
- brand: manufacturer (Topps, Panini, Upper Deck, Bowman, etc.)
- set: specific product name (Chrome, Prizm, Select, etc.)
- parallel: color/type (Base, Silver Prizm, Gold, Refractor, etc.) — "Base" if none
- cardNumber: the card # if visible (e.g. "#/99", "RC-21")
- team: the player's team shown
- condition: your honest assessment (Near Mint, Lightly Played, Good, Poor)
- isRookie: true if it's a rookie card (RC, Rated Rookie, First Bowman, etc.)

Be specific and accurate. If you can't read something clearly, say so rather than guessing.

Return ONLY JSON:
{
  "player": "",
  "year": "",
  "brand": "",
  "set": "",
  "parallel": "Base",
  "cardNumber": "",
  "team": "",
  "condition": "Near Mint",
  "isRookie": false,
  "confidence": "high|medium|low",
  "notes": "anything else visible (autograph, patch, numbered, etc.)"
}`,
        },
      ],
    }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Vision could not identify the card')

  const data = JSON.parse(match[0])
  return {
    player: data.player,
    year: data.year,
    brand: data.brand,
    set: data.set,
    parallel: data.parallel,
    cardNumber: data.cardNumber,
    team: data.team,
    condition: data.condition + (data.isRookie ? ' RC' : '') + (data.notes ? ` — ${data.notes}` : ''),
  } as CardInput
}

// ── Step 2: Post to eBay via Trading API ────────────────────────────────────

async function postToEbay(listing: CardListing, cardInfo: CardInput, imageBase64?: string): Promise<string> {
  if (!EBAY_TOKEN) throw new Error('EBAY_USER_TOKEN not set')

  // eBay Trading API — AddItem
  const pictureSection = imageBase64
    ? `<PictureDetails><PictureURL>https://i.imgur.com/placeholder.jpg</PictureURL></PictureDetails>`
    : ''

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${EBAY_TOKEN}</eBayAuthToken>
  </RequesterCredentials>
  <Item>
    <Title>${listing.title.slice(0, 80)}</Title>
    <Description><![CDATA[${listing.description}]]></Description>
    <PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>
    <StartPrice>${listing.suggestedPrice.toFixed(2)}</StartPrice>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <PaymentMethods>PayPal</PaymentMethods>
    <PayPalEmailAddress>cardchiefz@gmail.com</PayPalEmailAddress>
    <PostalCode>28201</PostalCode>
    <Quantity>1</Quantity>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsNotAccepted</ReturnsAcceptedOption>
    </ReturnPolicy>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>USPSFirstClass</ShippingService>
        <ShippingServiceCost>1.00</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <Site>US</Site>
    <ConditionID>3000</ConditionID>
    ${pictureSection}
    <ItemSpecifics>
      <NameValueList><Name>Player/Athlete</Name><Value>${cardInfo.player}</Value></NameValueList>
      <NameValueList><Name>Year Manufactured</Name><Value>${cardInfo.year}</Value></NameValueList>
      <NameValueList><Name>Manufacturer</Name><Value>${cardInfo.brand}</Value></NameValueList>
      <NameValueList><Name>Set</Name><Value>${cardInfo.set}</Value></NameValueList>
      ${cardInfo.parallel ? `<NameValueList><Name>Parallel/Variety</Name><Value>${cardInfo.parallel}</Value></NameValueList>` : ''}
      ${cardInfo.cardNumber ? `<NameValueList><Name>Card Number</Name><Value>${cardInfo.cardNumber}</Value></NameValueList>` : ''}
      <NameValueList><Name>Sport</Name><Value>Basketball</Value></NameValueList>
    </ItemSpecifics>
  </Item>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</AddItemRequest>`

  const res = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'AddItem',
      'Content-Type': 'text/xml',
    },
    body: xml,
  })

  const responseText = await res.text()
  const itemIdMatch = responseText.match(/<ItemID>(\d+)<\/ItemID>/)
  if (!itemIdMatch) {
    const errMatch = responseText.match(/<ShortMessage>(.*?)<\/ShortMessage>/)
    throw new Error(errMatch?.[1] ?? 'eBay listing failed — check token')
  }

  return `https://www.ebay.com/itm/${itemIdMatch[1]}`
}

// ── Main pipeline: image → eBay listing ─────────────────────────────────────

export interface ListingResult {
  cardInfo: CardInput
  listing: CardListing
  ebayUrl?: string
  draftMode: boolean
  id: string
}

export async function photoToListing(
  imageBase64: string,
  options: { draftMode?: boolean; mimeType?: string } = {}
): Promise<ListingResult> {
  const { draftMode = true, mimeType = 'image/jpeg' } = options
  const id = `listing_${Date.now()}`

  await slack(`📸 *Photo received — identifying card...*`)

  // Step 1: Vision
  const cardInfo = await identifyCardFromImage(imageBase64, mimeType)
  await slack(`🔍 *Identified:* ${cardInfo.player} ${cardInfo.year} ${cardInfo.brand} ${cardInfo.set}${cardInfo.parallel !== 'Base' ? ` (${cardInfo.parallel})` : ''}\nCondition: ${cardInfo.condition}`)

  // Step 2: Format listing
  const listing = await formatListing(cardInfo)
  await slack(`📝 *Listing drafted:*\n*${listing.title}*\nSuggested price: $${listing.suggestedPrice.toFixed(2)}\n_${listing.priceRationale}_`)

  // Step 3: Post or draft
  let ebayUrl: string | undefined
  if (!draftMode) {
    try {
      ebayUrl = await postToEbay(listing, cardInfo, imageBase64)
      await slack(`✅ *Listed on eBay!*\n${ebayUrl}\nPrice: $${listing.suggestedPrice.toFixed(2)}`)
    } catch (err) {
      await slack(`⚠️ *Draft saved — eBay post failed:* ${err instanceof Error ? err.message : String(err)}\nFix manually or reply "post it" to retry.`)
    }
  } else {
    await slack(`📋 *Draft mode — not posted yet.*\nReply "post it" to list for $${listing.suggestedPrice.toFixed(2)}, or adjust the price first.`)
  }

  // Save draft to memory for voice follow-up
  const result: ListingResult = { cardInfo, listing, ebayUrl, draftMode: !ebayUrl, id }
  await supabaseAdmin.from('ai_memories').insert({
    category: 'listing_draft',
    content: id,
    context: JSON.stringify(result),
    importance: 8,
    created_at: new Date().toISOString(),
  })

  return result
}

// Post a pending draft
export async function postPendingDraft(draftId?: string): Promise<void> {
  const query = supabaseAdmin.from('ai_memories').select('id, content, context').eq('category', 'listing_draft')
  const { data } = draftId
    ? await query.eq('content', draftId).single().then(r => ({ data: r.data ? [r.data] : [] }))
    : await query.order('created_at', { ascending: false }).limit(1)

  if (!data?.length) { await slack('No pending drafts found.'); return }

  const draft = JSON.parse((data[0] as { context: string }).context) as ListingResult
  if (!draft.draftMode) { await slack(`This listing is already posted: ${draft.ebayUrl}`); return }

  const url = await postToEbay(draft.listing, draft.cardInfo)
  await slack(`✅ *Posted to eBay!*\n${url}\nPrice: $${draft.listing.suggestedPrice.toFixed(2)}`)

  await supabaseAdmin.from('ai_memories').update({
    context: JSON.stringify({ ...draft, ebayUrl: url, draftMode: false }),
  }).eq('content', draft.id)
}
