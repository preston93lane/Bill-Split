# Bill Split

A phone-friendly web app for splitting a restaurant bill. Take a picture of the receipt, tap what each person ordered, and share everyone's total with the group.

## How it works

1. **Scan.** Take a photo (or pick one from your library). Google's Gemini AI reads the receipt and pulls out every item, the tax, any tip, and other fees. A line like "3 Beer $21.00" becomes three separate $7.00 beers so different people can each claim one.
2. **Check.** Compare against the receipt photo (tap it to view full screen, tap a spot to zoom in), fix anything that was misread, add or remove items, and set the tip with the 15/18/20/22% buttons or a custom amount. The app warns you if the items don't match the subtotal or total printed on the receipt.
3. **Split.** The bar across the top starts with just a **+** button. Tap it, type a name, then check the items that person ordered. Repeat for each person. Tap someone's name to switch to them, or tap it again to rename or remove them.
   - **Shared items:** if more than one person checks an item, it's split evenly between them.
   - **Table dishes:** tap **Table** on an item (apps, a shared bottle) to split it across everyone at the table, including people you add later.
4. **Totals.** If anything is still unclaimed, a warning lists those items, how many there are, and how much they add up to. You can make them table dishes with one tap, or go back and assign them. Each person's tax, tip, and fees are proportional to their share of the food. Everything is calculated in cents, so the shares always add up to the bill total exactly.
5. **Share.** Pick **who paid the bill**. Set the Venmo account that pay links go to from the **$** button at the top of any screen (or on the first screen); it's remembered for future bills. **Share with the group** opens your phone's share sheet (Messages, WhatsApp, Instagram DMs, and so on) with a picture of everyone's totals, plus a text with a Venmo link for each person that opens Venmo with their amount and a note filled in. The payer also gets a **Request on Venmo** button on each person's card. Nothing is ever sent automatically; Venmo always asks you to confirm. On desktop, sharing copies a text summary to the clipboard instead.

The receipt photo stays available from the receipt button at the top of every screen. Your progress is saved in the browser, so switching apps to text someone won't lose your work.

## Letting friends claim on their own phones

On the "Who had what?" screen, tap **Send link** and share it with the group. Each friend opens the link, taps their name (or types it in), checks off what they ordered, and taps **I'm done**. Then they see what they owe, with a **Pay on Venmo** button once every item is claimed.

The host sees it update live: who's done, who's still picking, who hasn't opened it, and how many items are left. **Remind everyone** shares a reminder listing who's still missing and what's unclaimed. **Nudge** sends one person a personal reminder. Messages go out through your phone's share sheet, so the app never needs anyone's phone number or contacts. The host can still check items off for anyone, mark table dishes, and finish the split.

**Nothing is lost if people are slow.** A shared bill stays online until nobody has opened or changed it for 90 days, and every visit resets that clock. Your phone also keeps a full copy. If the online copy ever expires, opening the bill on your phone puts it back automatically under the **same link**, with everyone's picks. Starting a new bill doesn't throw the old one away either: anything with people on it is saved under **Unfinished bills** on the first screen, ready to reopen (or delete with the trash icon).

### Turning on sharing (one time, free)

Shared bills are stored in a free Upstash Redis database connected through Vercel:

1. In your Vercel project, open the **Storage** tab → **Create Database** (or **Browse Marketplace**) → **Upstash for Redis**, and pick the free plan.
2. Connect it to this project. Vercel adds the connection settings automatically.
3. Redeploy (Deployments → ⋯ → Redeploy) so the app picks them up.

Without a database, the rest of the app still works; only **Send link** shows an error. When running locally without one, shared bills are kept in memory.

## Getting a free Gemini API key

Receipt scanning uses Google's Gemini API, which has a free tier.

1. Go to [aistudio.google.com](https://aistudio.google.com) and sign in with a Google account.
2. Click **Get API key**, then **Create API key**, and copy it.

The free tier has daily usage limits, which is plenty for splitting dinners. Google may use free-tier requests to improve its products. Receipts are sent to Google; nothing else about your group is. The app uses `gemini-3.5-flash-lite` by default; set `GEMINI_MODEL` to use a different model.

## Running locally

```bash
npm install
cp .env.example .env.local   # then add your GEMINI_API_KEY
npm run dev
```

Open the "Network" URL that Vite prints on your phone (same Wi-Fi) to try the camera.

You can also use **Try a sample** or **Type it in** without an API key. Those skip the scan.

```bash
npm test          # unit tests for the split math, receipt import, and share text
npm run build     # typecheck + production build
```

## Deploying

The app is set up for [Vercel](https://vercel.com): import the repo, add `GEMINI_API_KEY` as an environment variable, and deploy. `api/parse-receipt.ts` runs as a serverless function, so your API key stays on the server and never reaches the browser. In local development, the Vite dev server serves the same handler.

> **Note:** the `/api/parse-receipt` endpoint has no login. Anyone who finds your deployment's URL can use it and eat into your key's free daily limit. Before sharing the link widely, add some protection (Vercel password protection, an access code, or rate limiting).

## Project layout

| Path | What it is |
| --- | --- |
| `src/lib/split.ts` | Who owes what: even item splits, table dishes, proportional tax/tip/fees |
| `src/lib/money.ts` | Integer-cent helpers (even splits, largest-remainder allocation) |
| `src/lib/receipt.ts` | Turns the scanned receipt into an editable bill; sanity checks |
| `src/lib/share.ts` | The text message summary |
| `src/components/` | The four screens: Scan, Review, Split, Results |
| `server/parseReceipt.ts` | Sends the photo to Gemini and returns structured JSON |
| `api/parse-receipt.ts` | Vercel function wrapper |
| `server/tabs.ts`, `server/tabStore.ts` | Shared bills: the API friends' phones talk to, stored in Upstash Redis |
| `src/GuestApp.tsx` | What a friend sees when they open a shared link |
| `src/components/LivePanel.tsx` | The host's live status, reminders, and nudges |
