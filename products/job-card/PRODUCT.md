# Job Card

**Suggested price:** $15 USD, once.

Job Card is a browser form that writes a one-page brief before you hand a job to an AI agent. You say what done looks like, what it may touch, and when it should stop, then copy that brief into the session.

## What a person gets

- `card.html`, which runs entirely in the browser
- Copy, download as `.txt`, and print
- A draft kept in `localStorage` on that browser
- No account, no upload, no tracking

$15 is the suggestion because this is a small tool someone reuses, not a PDF and not a course. Change it if that is wrong. Keep it between $9 and $29.

## To launch

1. Read `index.html` and use `card.html`. Edit the price on the sales page if you do not want $15.
2. Create a Stripe payment link for that price, as a one-time payment. You do this in Stripe. Do not commit the link until you are ready to sell.
3. Put that link on the price section of `index.html`, in place of the sentence that says checkout is not live.
4. Decide if `card.html` stays publicly linked. Right now the sales page links to it so a reviewer can try it. If the file should be what people receive after they pay, remove that link before you publish the page.
5. Host this folder as static files. No server, no API key, no analytics snippet. The page says the brief never leaves the browser. That stays true only if you do not add a tracker.

## Not in this folder

No checkout, no payment code, and no payment URL. The link is yours to create.
