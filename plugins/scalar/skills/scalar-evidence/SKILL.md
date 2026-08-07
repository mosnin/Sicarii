---
name: scalar-evidence
description: Record what you observed about a contact or company field, and let Scalar price it.
---

# Record facts with evidence

Use `record_fact` when you have observed something about a field on a contact
or a company: their title, their email, a company's industry.

## The one rule

**You never set a confidence.** You report what you SAW, as evidence entries,
and Scalar's ledger decides how sure that makes the claim and whether it lands
on the record or waits for a human. There is no wording, no framing, and no
number you can supply that makes a claim count for more. Only evidence moves
it, and only evidence you actually gathered.

**Never invent evidence.** Do not add a kind because it would push a value
over a line. A fabricated entry is worse than a missing field: it puts wrong
data on a real person under a badge that says verified.

## One entry per INDEPENDENT source

Two facts read off the same page are ONE observation. A LinkedIn profile that
shows both the name and the employer is a single `linkedin.employer-and-name`
entry, not two entries. Entries are deduped by kind before scoring anyway, so
splitting a page into three gains nothing and only makes the queue harder for a
human to read.

## Picking the kind

Primary kinds tie the value to THIS exact person or company. Only a primary
source can carry a fact onto the record by itself.

| Kind | Use it when |
| --- | --- |
| `profile.email-match` | The profile you read lists an email that matches the address already on the record. |
| `registry.filing` | An official filing says so: Companies House, GLEIF, SEC EDGAR. Companies only. |
| `linkedin.employer-and-name` | A LinkedIn profile matches BOTH the person's name and their employer. Name alone is never enough. |
| `crm.thread-reply` | The person replied from this address on a thread already in the CRM. |
| `crm.signature-block` | An email signature in your own CRM history states it. |
| `email.verified-deliverable` | Bouncer confirmed the mailbox accepts mail. |
| `crm.meeting-attendance` | The person attended a calendar meeting under this address. |

Supporting kinds are consistent with the claim but identify nobody in
particular. They corroborate; they never carry a fact alone.

| Kind | Use it when |
| --- | --- |
| `web.cited-claim` | A public page states it and cites where it got it. |
| `search.cites-profile` | A search result points at the person's profile. |
| `handle.name-form` | A social handle is built out of the person's name. |
| `employer-only` | The employer matches, but nothing ties this specific person to it. |

And one more:

| Kind | Use it when |
| --- | --- |
| `contradiction` | Another source disagrees with the value. |

Report a contradiction the moment you see one. A disputed claim is held
unresolved for a human rather than averaged into a middling score, which is the
correct outcome: two sources disagreeing is not "probably true".

## Write `detail` for a human, not for a log

`detail` is read by a person deciding whether to accept your suggestion. Quote
what you actually saw.

- Good: `their signature on 14 July reads Head of Security, Acme`
- Good: `Companies House filing 2024-11-02 lists the registered office as 12 Bell Lane, Leeds`
- Bad: `signature match confirmed`
- Bad: `high confidence match`

If your detail could have been written without looking at the source, it is not
a detail.

## A suggestion is a good outcome

Three things can happen, and only one of them is a problem:

1. **Applied.** Strong evidence from a primary source. The value is written to
   the record.
2. **Suggested.** Anything weaker. It waits in the review queue for a person.
   This is a correct, useful result. Under the old model an ambiguous finding
   was simply discarded; now it is kept.
3. **Nothing stored.** The evidence was too thin. You are told why.

**Do not go hunting extra evidence just to push a claim over a line.** That
inverts the whole point. If one solid observation is what you have, report that
one observation and move on. You cannot apply or dismiss your own suggestion,
and you should not want to.

## Checking your work

- `list_proposed_facts` shows what is waiting on a human, with the current
  value on the record next to your proposed one.
- `get_fact_evidence` explains in plain English why a fact scored what it did.

## Accuracy (non-negotiable)

Never attach a fact to the wrong record. Verify the person's name AND their
company before you record anything about them, exactly as in `scalar-enrich`.
Prefer leaving a field empty over filling it with a guess.
