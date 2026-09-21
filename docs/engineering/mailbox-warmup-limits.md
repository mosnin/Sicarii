# Mailbox warmup limits: what is safe, what is marketing

**Date:** 2026-09-21 · **Status:** reasoned (not observed) · **Owner:** engineer

Scalar sends from a real mailbox identity. This note is the evidence behind
the default ramp in `src/lib/mailbox-warmup-limits.ts` and the
`scalar-safe-warmup` skill. It is **not** a claim that we have watched
inbox placement on a live Scalar domain. That debt is still owed.

**House rules (do not reopen):**
- Mailbox = identity. Do not turn Scalar into Instantly.
- No warmup peer-networks. No fake opens, clicks, or reply rings.
- When public sources disagree, take the **lower** volume. We would rather
  send 5 than 40.
- Provider hard limits (below) are not warmup advice. Hitting 2,000/day on
  Workspace is how you burn a domain, not how you warm one.

---

## 1. Provider hard limits (not warmup advice)

These are service caps. They tell you when the provider stops you. They do
**not** tell you what is safe for cold outreach.

### Google Workspace / Gmail

**Workspace paid user (Google Workspace Help, page last updated 2026-09-18):**
- 2,000 messages per user per rolling 24 hours (1,500 for mail merge).
- 10,000 total recipients/day; 3,000 external recipients/day.
- 3,000 unique recipients/day (2,000 unique external).
- Recipients per message: 2,000 total, 500 external.
- SMTP AUTH / IMAP / POP: 100 recipients per message.
- After a limit: no new sends for up to 24 hours. Limits can change without
  notice.

Source: [Gmail sending limits in Google Workspace](https://support.google.com/a/answer/166852)
(Google Workspace Help, fetched 2026-09-21; "Last updated 2026-09-18 UTC").

**Workspace trial / new paid accounts (same page, 2026-09-18):**
- Trial: 500 messages/day and 500 unique external recipients/day.
- After converting to paid: limits rise only after the domain has
  **cumulatively paid at least $100 USD** (domain purchase from Google does
  not count toward that $100). Then it can take **up to 75 days**.
- Trial Drive/Groups have extra outbound restrictions.

**Consumer Gmail (`@gmail.com` / `@googlemail.com`):**
- Official Help: more than 500 recipients in one message **and/or** more
  than 500 emails in a day trips "You have reached a limit for sending
  mail." Sending usually returns in 1-24 hours.
- Source: [Limits for sending & getting mail](https://support.google.com/mail/answer/22839)
  (Gmail Help, fetched 2026-09-21).
- **Asserted, not official:** several vendors (GMass 2024-2025 posts;
  OldGmail.com; emailwarmup.com on SMTP 550 5.4.5) say new consumer accounts
  are held to ~50-200/day at first. Google does not publish a staged
  new-account number. Treat "new Gmail is tighter than 500" as **observed
  by vendors**, not as a Google spec.

**Workspace SMTP relay (separate from the Gmail UI quota):**
- Each user: up to 10,000 messages in 24 hours (lower on trial).
- 10,000 unique recipients / 24 hours per user.
- 100 recipients per SMTP transaction on `smtp-relay.gmail.com`.
- Count is on the envelope sender, not From / Reply-To.
- Source: [Route outgoing SMTP relay messages through Google](https://support.google.com/a/answer/2956491)
  (Google Workspace Help, fetched 2026-09-21).

### Google / Yahoo / Microsoft bulk-sender rules (2024-2026)

These apply when you send **to personal Gmail / Outlook.com**, especially
above ~5,000 messages/day. Scalar inboxes should stay far below that. The
auth and spam-rate rules still apply at low volume and are the hygiene
floor.

**Google, effective 2024-02-01** ([Email sender guidelines](https://support.google.com/mail/answer/81126),
Gmail Help, fetched 2026-09-21):

All senders to personal Gmail:
- SPF **or** DKIM.
- Spam rate in Postmaster Tools below **0.3%**.
- Do not impersonate Gmail From: headers. Use TLS.

Bulk senders (**more than 5,000 messages/day** to Gmail accounts):
- SPF **and** DKIM, aligned with the From: domain.
- DMARC published. `p=none` is enough to pass the requirement.
- Forward + reverse DNS (PTR) on sending IPs.
- TLS.
- Marketing / subscribed mail: one-click unsubscribe
  (`List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
  RFC 8058) **and** a visible unsubscribe link in the body.
- Keep Postmaster spam rate **below 0.10%** and **never reach 0.30%**.

**Google FAQ enforcement (2024-2026)** ([Email sender guidelines FAQ](https://support.google.com/mail/answer/14229414),
fetched 2026-09-21):
- April 2024: Google began rejecting a share of non-compliant bulk traffic.
- June 2024: bulk senders over **0.3%** user-reported spam are ineligible
  for delivery mitigation until the rate stays under 0.3% for **7 consecutive
  days**.
- **November 2025:** Gmail ramps enforcement. Failures of alignment, missing
  SPF+DKIM, missing PTR, no TLS, or bad RFC 5322 get temporary or permanent
  rejects or spam foldering. Missing DMARC, missing one-click unsub, or
  unsubs not honored within 48 hours: mitigations unavailable.

**Yahoo (2024):** same era as Google. Functioning List-Unsubscribe on
promotional mail; honor unsubs within 2 days. Yahoo began List-Unsubscribe
enforcement in June 2024 (Yahoo sender best practices, summarized by
Palisade and MarTech, 2024-2025). Yahoo does not publish a 5,000/day
numeric threshold the way Google does.

**Microsoft Outlook.com consumer (2025):** Microsoft announced bulk-sender
rules that mirror Google/Yahoo for senders of 5,000+/day to Outlook.com /
Hotmail / Live. Non-compliant bulk was to go to Junk on 2025-05-05;
Microsoft then said those messages would be **rejected** starting that date
(MarTech, April 2025 recap of Microsoft's announcement).

### Microsoft 365 / Exchange Online

**Per mailbox (Microsoft Learn, Exchange Online limits, fetched 2026-09-21):**
- Recipient rate limit: **10,000 recipients / rolling 24 hours**. Cannot be
  raised.
- Message rate limit: **30 messages per minute**. Excess is throttled into
  later minutes.
- Recipients per message: default 500 (customizable 1-1,000).

Source: [Exchange Online limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits)
and [Outbound spam sending limits](https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-sending-limits-troubleshoot).

**Tenant External Recipient Rate Limit (TERRL), Microsoft Exchange team,
2025:**
- Trial tenants: **500 external recipients/day** for the whole tenant
  (Microsoft Community Hub "Introducing Exchange Online Tenant Outbound
  Email Limits"; later commentary sometimes quotes 5,000 for trial. Prefer
  the Exchange blog table: trial = 500).
- New paid tenants: reduced TERRL during onboarding.
- 1 paid email license: 10,000 external recipients/day for the tenant.
- More licenses raise the tenant cap on a diminishing curve (2 licenses =
  10,312; 10 licenses = 12,006).

Source: [Introducing Exchange Online Tenant Outbound Email Limits](https://techcommunity.microsoft.com/blog/exchange/introducing-exchange-online-tenant-outbound-email-limits/4372797)
(Microsoft Exchange team).

**New mailbox reputation:** Microsoft does **not** publish a per-mailbox
warmup calendar. Exclaimer’s 2025 IT guide (not Microsoft) says 4-8 weeks
for a new domain and a shaping guide of 10-20/day in week one, +~20%/week.
That is **asserted industry practice**, not a Microsoft spec.

### Typical SMTP relay / shared IP

- Shared IP: reputation is pooled. A neighbor can hurt you. You usually
  skip *IP* warmup because the pool is already warm. Your **domain** still
  has no reputation.
- Dedicated IP: AWS SES (docs, fetched 2025-2026) auto-warms standard
  dedicated IPs from day 1 toward 50,000/day over **45 days**, and then
  wants ~1,000/day per provider to *keep* the IP warm. SendGrid / Mailgun
  docs put dedicated-IP usefulness around high tens or hundreds of
  thousands of messages per month.
- Cold outreach from Workspace or Microsoft 365 already rides those
  providers' shared IPs. A dedicated SMTP IP is the wrong tool for a
  handful of agent mailboxes.
- Relays (SendGrid, Mailgun, SES, SMTP2GO) will still throttle a **new
  domain** that spikes, even on a warm shared IP. SMTP2GO (2025 high-volume
  guide): shared IP skips IP warmup; domain reputation does not.

---

## 2. Warmup ramps used in production (vendor claims)

All of the following are **asserted by vendors that sell warmup or
inboxes**. Several of them run peer-networks (the thing Scalar will not
build). Use them as a range, then take the floor.

| Who | When (page / fetched) | What they recommend | Notes |
|---|---|---|---|
| Instantly, "30-Day Warmup & Hygiene" | blog, fetched 2026-09-21 | Days 1-5: 5-10/day. Days 6-7: 10-20. Days 8-14: 20-40. Days 15-21: 40-60. Days 22-30: 60-100. Then "safe cold cap" 30/inbox. First cold 10-20 after day 14 if bounce < 1%. | Marketing high end. Do not copy 60-100. |
| Instantly, B2B outbound guide | blog, fetched 2026-09-21 | Days 1-10: 5-10. Days 11-20: 15-20. Days 21-30: 25-30. Cap 30/inbox. | More conservative Instantly page. Still a vendor claim. |
| Instantly, AI Reply Agent plan | blog, fetched 2026-09-21 | Week 1: 5. Week 2: 10-15. Week 3: 20-25. Week 4: 30. | Cleaner ladder. Still not observed here. |
| Instantly, "Slow Ramp" | blog, fetched 2026-09-21 | Week 1: 10-15, then +10-20% if green, max 30. | Conflicts with their own 5/day week-1 page. Take 5. |
| Smartlead Help, AI warmup | helpcenter, fetched 2026-09-21 | Daily ramp-up for fresh domains. While a campaign is live, keep warmup at 10-20/day. | Peer-network warmup. Scalar does not copy the network. |
| Smartlead API docs | api.smartlead.ai, fetched 2026-09-21 | Example: day 1 warmup 5 / cold 0; day 5 warmup 10 / cold 5; day 10 warmup 15 / cold 15; day 20 warmup 20 / cold 30. New SMTP daily 20-30. | Example only. Aggressive on cold by day 5. |
| Smartlead, secondary domains | blog, fetched 2026-09-21 | Week 1: 5-15. Week 2: 15-30. Week 3: 30-50. Week 4: 50-150. 2-4 weeks min. 2-3 mailboxes/domain in their pre-warmed SKU (1:3). | Week 4 50-150 is marketing. |
| Smartlead pre-warmed mailboxes | help 429, fetched 2026-09-21 | Start 20-30/day per pre-warmed mailbox, +5/day. 3 mailboxes/domain. | Assumes *their* pre-warm, not a brand-new domain. |
| Mailreach, 14-day calendar | blog, fetched 2026-09-21 | Day 1: 2, then 4, 6, 8, 10, 12, 15 ... day 14: 50. Stay under 100/inbox for B2B. | Starts honest (2). Ends high (50 in two weeks). |
| Mailreach, alternate calendar | "Does warmup work" blog | Days 1-7: 2, 2, 3, 3, 4, 5, 6. Day 14: 40. Day 15: 50. | Two official-looking calendars on one site. Take the slower one. |
| Mailreach, domain warmup 2026 | blog | Start 15-20/day (conflicts with the 2/day calendar). Days 15-21: 75-100 on Workspace/Outlook. | Ignore the 75-100 for Scalar. |
| Warmbox Help, Grow-Progressive | help.warmbox.ai, 2022-09-06 (still cited 2026) | Ramp from low to a max they recommend of **40/day**. Min duration **45 days**. Reply-rate target 30%, never above 45%. | Peer-network. Duration (45 days) is the useful bit. |
| GigRadar warmup comparison | 2026 | Warmbox defaults are "aggressive enough to suspend Workspace/Outlook on domains under 6 months." Operators crank new domains to ~5/day. Week 1: 5-10. Week 2: 15-25. Week 3: 30-50. | Operator observation, not a lab. |
| Premium Inboxes (via Puzzle Inbox review, 2026) | Puzzle claims PI docs say start cold at 20-30/inbox/day; audited operators say PI boxes need **another 7-14 days** of warmup and that 20-30 on week one spikes bounces. Puzzle's own advice: start 15/day. | Competitor review. Treat PI "deliverability-ready" as **asserted**. |
| ScaledMail, 2026 inbox math | blog | Workspace: 2 inboxes/domain, 15-25 cold/inbox. M365: 2-3 inboxes, 10-25. New domain: week 1 warmup only; week 2: 5-10 cold; weeks 3-4: 15-20; after 30-45 days: 25-40 with warmup still on. Domain ceiling ~50-75 cold/day. | Closest to a conservative operator writeup. |
| Allston Labs warmup | 2026 | 3 mailboxes/domain. Max **20 cold**/inbox. No cold before day 14; day 21 safer. Warmup forever at 10-15/day. | Aligns with "prefer 5 over 40." |
| Praecora | 2025-2026 | 4-6 weeks for a new domain, not 2-3. Week 1: 3-5 warmup, zero cold. Then a 5-10 test to known inboxes before any campaign. 2-3 mailboxes/domain. | Conservative. |
| Exclaimer (M365 IT guide) | 2025 | 4-8 weeks. 10-20/day week 1, +~20%/week. | Not Microsoft. |

**Split: warmup mail vs first cold, while still WARMING**

| Day | Instantly marketing (high) | Smartlead API example | Mailreach slow calendar | Conservative operators (ScaledMail / Allston / Praecora) |
|---|---|---|---|---|
| 3 | 5-10 total, some say first cold | warmup only or tiny | 3-6 warmup, 0 cold | **0 cold** |
| 7 | 10-20 total | warmup ~10, cold 0-5 | 6-15 warmup | **0 cold** (aged: maybe 2) |
| 14 | 20-40, first 10-20 cold | warmup 15, cold 15 | 40-50 total | **0-5 cold** if metrics green |
| 21 | 40-60 | warmup 20, cold ~30 | 50-75 | **5-10 cold** on a new domain |

Scalar default follows the right-hand column, then cuts it again.

---

## 3. Domain, DNS, inboxes per domain

**Domain age.** Brand-new domains get the unknown-sender treatment even if
SPF/DKIM/DMARC are perfect. A quiet week after registration (DNS settles,
site resolves, no outbound) is the cheapest aging you can buy (SpamCipher
2026; Praecora). An aged domain (months of existence, a real site, existing
auth) still needs the *inbox* warmed. A new subdomain of an aged parent is
often treated as new.

**DNS (do this before day 1 volume):**
- SPF: include only the servers you send from. **Never `+all`.** `+all`
  authorizes the world and is a hard stop in Scalar health
  (`src/lib/mailbox-health.ts`). Prefer `~all` while learning, `-all` once
  every sender is listed.
- DKIM: aligned with the From: domain (Google bulk rule; good at any volume).
- DMARC: start `p=none` with a rua mailbox, then `quarantine`, then
  `reject` when you have months of clean reports. Google accepts `p=none`
  as "DMARC is published."
- MX must exist. Missing MX is a hard stop.
- Custom tracking domain: if you ever add open/click tracking, CNAME it on
  your domain. Shared tracker domains (`links.instantly.ai` style) are a
  known spam feature. **Prefer no tracking pixel on a new inbox.**
- From: domain must match the domain you authenticated. Do not send
  `From: ada@client.com` via `smtp.your-relay.net` without SPF/DKIM
  alignment.

**Inboxes per domain.** Smartlead pre-warmed SKU, ScaledMail, Praecora,
Allston: **2-3 inboxes per sending domain**. Allston: never more than five.
Do not stand up 20 inboxes on a 3-day-old domain and blast. Domain
reputation is shared; the 21st inbox inherits the damage.

**Primary brand domain.** Keep customer and login mail off the cold-sending
domain. Secondary lookalikes are the usual pattern. That is operator
policy, not a Scalar product.

---

## 4. What actually gets you spam

Named by Google sender guidelines, FTC CAN-SPAM, CASL, and every serious
operator writeup:

1. **Spam complaint rate** at or above 0.10% (warn) / 0.30% (Google: no
   mitigation; often a death spiral). One "Report junk" in 300 sends is
   already 0.33%.
2. **Bounce rate** over ~2% (hard bounces under 1% is the vendor chorus).
   Purchased lists and guessed addresses are how you get there.
3. **Sudden volume spikes.** Day 1 = 5, day 2 = 80 looks like a compromised
   mailbox.
4. **Copied templates** sent to hundreds of people (same body, same links).
5. **Link shorteners** (bit.ly, t.co). Filters treat them as cloaking.
6. **Image-only mail** or giant HTML with a 1x1 tracking pixel and no text.
7. **Purchased / scraped lists.** Illegal in spirit under CAN-SPAM
   (you are responsible for the list). CASL requires consent.
8. **Role addresses** (`info@`, `sales@`, `admin@`, `noreply@`) bounce or
   trap.
9. **No unsubscribe** (CAN-SPAM requires a working opt-out; Google bulk
   requires one-click; CASL requires a readily-performed unsub).
10. **Mismatched From vs domain** (fails DMARC alignment).
11. **Fake `Re:` / `Fwd:`** on a first touch. Filters and humans both
    notice.
12. **Attachments on first touch.**
13. **SPF `+all`**, broken DKIM, missing MX.
14. **Sending from a warming inbox** that has no history.

---

## 5. Recommended Scalar ramp

**Evidence rung: REASONED.** Floor of the sources above. Not tested on a
live Scalar send. Not observed.

Default profile is **new domain + new inbox**. That is what a purchased
Premium Inbox on a newly bought domain is. Aged and BYOK are explicit
exceptions.

### New domain + new inbox (default)

| day | warmupSends | maxColdSends | notes |
|-----|-------------|--------------|-------|
| 1 | 3 | 0 | DNS must pass. No cold. Agent does not `send_email` to contacts. |
| 3 | 4 | 0 | Still warmup only. |
| 7 | 6 | 0 | End of week 1. Still 0 cold. |
| 14 | 10 | 0 | Instantly would allow 10-20 cold. We do not, on a new domain. |
| 21 | 12 | 5 | Ready day. First cold cap is 5, not 40. Promote only if health is clean. |
| 30 | 5 | 15 | Maintenance warmup + modest cold. |
| 31+ | 5 | 20 | Steady ceiling. Add a domain, do not raise this inbox to 40. |

Days not listed interpolate from `src/lib/mailbox-warmup-limits.ts`
(day 2 = 3/0, days 4-6 climb 4-5 warmup, days 22-28 climb cold 8 -> 12).

### Aged domain + new inbox

Domain exists 6+ months, site resolves, SPF/DKIM/DMARC already passing.
Inbox is new.

| day | warmupSends | maxColdSends | notes |
|-----|-------------|--------------|-------|
| 1 | 5 | 0 | Warmup only until the inbox has a week of clean mail. |
| 3 | 5 | 0 | |
| 7 | 8 | 2 | First tiny cold if bounce < 1% and zero complaints. |
| 14 | 10 | 5 | Still far below Instantly's 20-40. |
| 21 | 12 | 10 | |
| 30+ | 8 | 25 | Ceiling. Not 40. |

### Already-warm BYOK

Operator checked "already warm" or marked the mailbox ready. We take their
word. We still cap the inbox.

| day | warmupSends | maxColdSends | notes |
|-----|-------------|--------------|-------|
| any | 0 | 25 | No peer-network. Stop on bounce / complaint / auth fail. Never 40 on day 1 of *our* clock just because the inbox is old. |

### How this compares to the leftover 5/10/20/30/40 table

`src/lib/mailbox-warmup.ts` still ships `5 / 10 / 20 / 30 / 40` as
`dailySendLimitForWarmupDay` because the sibling implementer is mid-rewrite
(hourly caps, warmup-vs-cold remaining). That ladder is **more aggressive**
than this research. Implementer should import `dailyTotalCapForDay` /
`maxColdSendsForDay` from `mailbox-warmup-limits.ts` and delete the old
table so there is one source of truth.

---

## 6. Asserted vs observed

| Claim | Rung | Who |
|---|---|---|
| Workspace 2,000/day, trial 500, $100 + 75 days | Official spec | Google Help, 2026-09-18 |
| Consumer Gmail ~500/day | Official spec | Gmail Help |
| New consumer Gmail often 50-200/day | Vendor observation | GMass, others |
| Bulk sender SPF+DKIM+DMARC, 0.10% / 0.30%, one-click unsub | Official spec | Google 2024-02-01; FAQ Nov 2025 enforcement |
| M365 10k recipients/day, 30/min | Official spec | Microsoft Learn |
| TERRL trial 500, 1-license tenant 10k | Official spec | Microsoft Exchange blog |
| Instantly / Smartlead / Mailreach daily calendars | Vendor assertion | Their blogs |
| 2-3 inboxes per domain | Industry assertion, repeated | Smartlead, ScaledMail, Praecora, Allston |
| Scalar ramp above | **Reasoned** from the floor of those sources | this doc |
| Live inbox placement on a Scalar domain | **Not observed** | owed to reality |

---

## 7. Sources (fetched 2026-09-21 unless noted)

1. Google Workspace Help, "Gmail sending limits in Google Workspace",
   https://support.google.com/a/answer/166852 (updated 2026-09-18).
2. Gmail Help, "Limits for sending & getting mail",
   https://support.google.com/mail/answer/22839
3. Gmail Help, "Email sender guidelines",
   https://support.google.com/mail/answer/81126 (rules from 2024-02-01).
4. Gmail Help, "Email sender guidelines FAQ",
   https://support.google.com/mail/answer/14229414 (Nov 2025 enforcement).
5. Google Workspace Help, "Route outgoing SMTP relay messages through Google",
   https://support.google.com/a/answer/2956491
6. Microsoft Learn, "Exchange Online limits",
   https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits
7. Microsoft Learn, "Outbound spam sending limits",
   https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-sending-limits-troubleshoot
8. Microsoft Exchange team, "Introducing Exchange Online Tenant Outbound Email Limits",
   https://techcommunity.microsoft.com/blog/exchange/introducing-exchange-online-tenant-outbound-email-limits/4372797
9. FTC, "CAN-SPAM Act: A Compliance Guide for Business",
   https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
10. CRTC / ISED, CASL FAQ and consent guidance,
    https://crtc.gc.ca/eng/com500/faq500.htm/ ,
    https://www.ised-isde.canada.ca/site/canada-anti-spam-legislation/en/getting-consent-send-email
11. RFC 8058, one-click List-Unsubscribe.
12. Instantly blogs: 30-day hygiene; B2B outbound; AI Reply warmup; Slow Ramp
    (instantly.ai/blog, fetched 2026-09-21).
13. Smartlead Help article 52 (AI warmup), article 429 (pre-warmed, 1:3),
    Smartlead API email-accounts + best-practices, Smartlead "Secondary Domains"
    blog.
14. Mailreach: "Email Warmup Schedule", "Does Email Warmup Work",
    "How to warm up email domain" (2026).
15. Warmbox Help, "Grow - Progressive warm-up", 2022-09-06.
16. GigRadar, "Email Warmup Tool: 9 Compared" (2026).
17. Puzzle Inbox, "Premium Inboxes Review 2026".
18. ScaledMail, "How Many Cold Emails Per Day?" (2026).
19. Allston Labs warmup guide (2026).
20. Praecora, "Email Warm-Up Explained".
21. AWS SES, "Warming up dedicated IP addresses (standard)".
22. SMTP2GO, "High-Volume Email Warmup" (2025).
23. MarTech, Google/Yahoo/Microsoft bulk-sender recap (2024-2025).

---

*Related: `docs/decisions/0017-safe-warmup-and-scale.md`,
`docs/decisions/0015-agent-mailboxes.md`, skills `scalar-safe-warmup` and
`scalar-outreach-copy`.*
