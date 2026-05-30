// Slack notification helper — posts content to Slack for AB's approval
// Agents generate → Slack preview → AB approves → Buffer schedules

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN

async function postToSlack(channel: string, text: string, blocks?: unknown[]): Promise<void> {
  if (!SLACK_BOT_TOKEN) return

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text, blocks }),
  })
}

export async function notifyEchoContent(content: {
  theme: string
  date: string
  twitter: string[]
  linkedin: string[]
  instagram: string[]
  facebook: string[]
  blogIdea: string
}): Promise<void> {
  const text = `🟣 *ECHO — ResumeChiefz Content Ready for Review*
📅 ${content.date} | Theme: ${content.theme}

*🐦 Twitter/X (3 posts):*
${content.twitter.map((t, i) => `${i + 1}. ${t}`).join('\n\n')}

*💼 LinkedIn (2 posts):*
${content.linkedin.map((p, i) => `${i + 1}. ${p.slice(0, 300)}...`).join('\n\n')}

*📸 Instagram (2 captions):*
${content.instagram.map((p, i) => `${i + 1}. ${p.slice(0, 200)}...`).join('\n\n')}

*📘 Facebook (2 posts):*
${content.facebook.map((p, i) => `${i + 1}. ${p.slice(0, 200)}...`).join('\n\n')}

*📝 Blog Idea:* ${content.blogIdea}

Reply *APPROVE* to schedule all to Buffer, or *EDIT [platform] [number]* to revise.`

  await postToSlack('#echo', text)
  await postToSlack('#jarvis', `📣 Echo has today's RC content ready for your review in #echo, AB.`)
}

export async function notifyReelContent(content: {
  theme: string
  date: string
  instagram: string[]
  facebook: string[]
  twitter: string[]
  marketInsight: string
  youtubeIdea: string
}): Promise<void> {
  const text = `🟡 *REEL — Card Chiefz Content Ready for Review*
📅 ${content.date} | Theme: ${content.theme}

*📸 Instagram (2 captions):*
${content.instagram.map((p, i) => `${i + 1}. ${p.slice(0, 200)}...`).join('\n\n')}

*📘 Facebook (2 posts):*
${content.facebook.map((p, i) => `${i + 1}. ${p.slice(0, 200)}...`).join('\n\n')}

*🐦 Twitter/X (3 posts):*
${content.twitter.map((t, i) => `${i + 1}. ${t}`).join('\n\n')}

*📊 Market Insight:* ${content.marketInsight}

*🎬 YouTube Idea:* ${content.youtubeIdea}

Reply *APPROVE* to schedule to Buffer, or *EDIT [platform] [number]* to revise.`

  await postToSlack('#reel', text)
  await postToSlack('#jarvis', `📣 Reel has today's CC content ready for your review in #reel, AB.`)
}

export async function notifyListing(listing: {
  title: string
  description: string
  suggestedPrice: number
  priceRationale: string
}): Promise<void> {
  const text = `🟠 *LISTER — eBay Listing Ready for Review*

*Title:* ${listing.title}
*Price:* $${listing.suggestedPrice}
*Rationale:* ${listing.priceRationale}

*Description preview:*
${listing.description.slice(0, 300)}...

Reply *APPROVE* to go live on eBay, or *EDIT* to adjust.`

  await postToSlack('#lister', text)
  await postToSlack('#jarvis', `📣 Lister has a new eBay listing staged for review in #lister, AB.`)
}

export async function notifyRedditDraft(draft: {
  subreddit: string
  postTitle: string
  draftReply: string
  mentionsRC: boolean
  karmaNote: string
}): Promise<void> {
  const text = `🔴 *SCOUT — Reddit Reply Draft*

*Subreddit:* r/${draft.subreddit}
*Post:* ${draft.postTitle}
*Mentions RC:* ${draft.mentionsRC ? '✅ Yes (soft)' : '❌ No'}
*Karma note:* ${draft.karmaNote}

*Draft reply:*
${draft.draftReply}

Reply *APPROVE* to post, *EDIT* to revise, or *SKIP* to pass.`

  await postToSlack('#scout', text)
  await postToSlack('#jarvis', `📣 Scout has a Reddit reply draft ready in #scout, AB.`)
}

export async function notifyJarvis(message: string): Promise<void> {
  await postToSlack('#jarvis', message)
}
