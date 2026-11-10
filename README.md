# Bill Split

A phone-friendly web app for splitting a restaurant bill. Take a picture of the receipt, tap what each person ordered, and share everyone's total with the group.

## How it works

1. **Scan.** Take a photo (or pick one from your library). Claude reads the receipt and pulls out every item, the tax, any tip, and other fees. A line like "3 Beer $21.00" becomes three separate $7.00 beers so different people can each claim one.
2. **Check.** Fix anything that was misread, add or remove items, and set the tip with the 15/18/20/22% buttons or a custom amount. The app warns you if the items don't match the subtotal or total printed on the receipt.
3. **Split.** The bar across the top starts with just a **+** button. Tap it, type a name, then check the items that person ordered. Repeat for each person. Tap someone's name to switch to them, or tap it again to rename or remove them.
   - **Shared items:** if more than one person checks an item, it's split evenly between them.
   - **Table dishes:** tap **Table** on an item (apps, a shared bottle) to split it across everyone at the table, including people you add later.
4. **Totals.** If anything is still unclaimed, a warning lists those items, how many there are, and how much they add up to. You can make them table dishes with one tap, or go back and assign them. Each person's tax, tip, and fees are proportional to their share of the food. Everything is calculated in cents, so the shares always add up to the bill total exactly.
5. **Share.** **Share with the group** opens your phone's share sheet (Messages, WhatsApp, Instagram DMs, and so on) with a summary of what everyone owes. On desktop it copies the summary to the clipboard instead.

Your progress is saved in the browser, so switching apps to text someone won't lose your work.

## Running locally

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open the "Network" URL that Vite prints on your phone (same Wi-Fi) to try the camera.

You can also use **Try a sample** or **Type it in** without an API key. Those skip the scan.

```bash
npm test          # unit tests for the split math, receipt import, and share text
npm run build     # typecheck + production build
```

## Deploying

The app is set up for [Vercel](https://vercel.com): import the repo, add `ANTHROPIC_API_KEY` as an environment variable, and deploy. `api/parse-receipt.ts` runs as a serverless function, so your API key stays on the server and never reaches the browser. In local development, the Vite dev server serves the same handler.

> **Note:** the `/api/parse-receipt` endpoint has no login. Anyone who finds your deployment's URL can use it and spend your API credits. Before sharing the link widely, add some protection (Vercel password protection, an access code, or rate limiting).

## Project layout

| Path | What it is |
| --- | --- |
| `src/lib/split.ts` | Who owes what: even item splits, table dishes, proportional tax/tip/fees |
| `src/lib/money.ts` | Integer-cent helpers (even splits, largest-remainder allocation) |
| `src/lib/receipt.ts` | Turns the scanned receipt into an editable bill; sanity checks |
| `src/lib/share.ts` | The text message summary |
| `src/components/` | The four screens: Scan, Review, Split, Results |
| `server/parseReceipt.ts` | Sends the photo to Claude and returns structured JSON |
| `api/parse-receipt.ts` | Vercel function wrapper |
