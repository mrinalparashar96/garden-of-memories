# STILL HERE — Garden of Memories

STILL HERE is a Garden of Memories at the Sydney Opera House: a particle-cloud map of Sydney opens onto the golden Opera House, where visitors brush the sails, open memories left by others, keep the ones that stay with them, and leave one of their own.

## Run it locally

The 3D models already live under `public/assets`. From this folder:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Useful checks:

```bash
npm test
npm run lint
npm run build
```

## Features

**Map and garden.** A Sydney harbour point cloud opens first; only the Opera House is unlocked. Inside the garden, the building is a floating particle field — brush the sails, tap a warm glow to read a memory.

**Adding a memory.** Leave a memory as text or as a spoken take (up to 60 seconds). Chrome and Safari show a live transcript while you speak, with twenty languages to choose from. You pick a feeling, how you know the place, and where on the house it belongs, then hold to leave it.

**Keeping memories.** Bookmark a memory from the panel. Saved memories live in a list on this device so you can return to them later.

**Feeling filter.** Filter the garden by Love, Nostalgia, Joy, Wonder, or Pain. Matching memories stay bright; the rest dim.

**Finding your own.** Memories you left are marked “Left by you.” Bookmarks keep a personal list of what you chose to keep.

**Memory Pass.** Make a pass with your name and artwork. It is your identity when you leave memories, and you can edit it later. Hold to remove the pass if you want to start the Make Pass flow again (your left memories stay).

**Add to Apple Wallet.** A finished pass can be saved to Apple Wallet. Signing happens on the server (`api/wallet-pass.js`) with a [WalletWallet](https://walletwallet.dev) key the browser never sees. On Safari on iPhone or Mac, use **Add to Apple Wallet**. Elsewhere, a QR opens the same pass on a phone that can add it. Local `npm run dev` alone cannot sign a pass; use a deployed URL or `vercel dev` with the key.

## Deployment

Deploy to [Vercel](https://vercel.com). Set `WALLETWALLET_API_KEY` for Production and Preview (see `.env.example`). Do not commit the real key.

Wallet passes need a public HTTPS URL: WalletWallet fetches the logo, icon, and constellation strip from your deployment. Local Vite alone cannot serve signed passes.

To wipe a demo device, open `/?reset=1`. That clears the pass, local memories, bookmarks, and voice-language preference, shows “Starting fresh,” then loads the app without the parameter.

## How data is stored

Everything lives in the browser’s `localStorage` (pass, memories you left, bookmarks, voice language). There is one pass per browser and no shared backend yet, so another device or a cleared cache will not see your pass or your saved memories. Seeded garden memories ship with the app; visitor memories stay on that device until reset or cleared storage.

## Browser support

Chrome and Safari support voice transcription. Firefox can record audio but does not transcribe. Add to Apple Wallet works on Apple devices (Safari on iOS or macOS); other browsers get the QR fallback.

## Project layout

| Path | Role |
|------|------|
| `src/main.js` | App flow: opener → map → garden → screens |
| `src/sydneyMap.js` / `src/garden.js` | Harbour map and Opera House particle garden |
| `src/screens/` | Opener, walkthrough, Make Pass, leave a memory, locations |
| `src/pass/` | Pass card, store, art |
| `src/memoryStore.js` / `src/bookmarkStore.js` | Local memories and bookmarks |
| `src/voiceCapture.js` / `src/voiceLanguages.js` | Spoken takes and language list |
| `src/walletPass.js` | Wallet offer, QR, and client request |
| `src/freshStart.js` | `/?reset=1` wipe |
| `api/` | Wallet pass signing and constellation strip |
| `public/assets/` | GLBs, pass art, ambient audio |
| `tests/` | Vitest coverage |

## Credits

**Sydney NSW Australia** 3D model via [Sketchfab](https://sketchfab.com/3d-models/sydney-nsw-australia-19402dd9c2ba41588712574b0b211baa) — harbour point-cloud map (`public/assets/sydney-nsw.glb`). See the Sketchfab page for the author and license terms.
