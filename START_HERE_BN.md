# MyntraAI + NanoBananaAPI — আগে এটা পড়ো

এই ZIP-এ source code আছে, কিন্তু security-এর জন্য কোনো আসল `.env`, API key, MongoDB password, `node_modules` বা পুরোনো build output রাখা হয়নি। তোমার আগের project folder-এর `server/.env` নিজের PC-তে আছে—সেটি নতুন folder-এ নিজে copy করো। এখানে/chat-এ paste কোরো না।

## 1) নতুন project folder তৈরি করো

ZIP extract করো। তারপর নতুন folder-এ `server` এবং `client` থাকবে। আগের project-এর `server/.env` ফাইলটি নতুন project-এর `server/.env`-এ copy করো। এতে তোমার MongoDB settings থাকবে।

## 2) `server/.env` update করো

পুরোনো `MONGODB_URI`, `MONGODB_DB_NAME`, `PORT`, এবং `CLIENT_ORIGIN` রেখে দাও। Gemini-র বদলে নিচের NanoBanana settings যোগ করো:

```env
NANOBANANA_API_KEY=YOUR_NEW_ROTATED_KEY
NANOBANANA_PUBLIC_BASE_URL=https://YOUR-HTTPS-TUNNEL.trycloudflare.com
NANOBANANA_CALLBACK_URL=
NANOBANANA_TUNNEL_RESTRICT_MODE=true
```

**তুমি chat-এ যে API key পাঠিয়েছিলে সেটি আর ব্যবহার কোরো না।** Provider dashboard থেকে সেটি revoke/rotate করে fresh key ব্যবহার করো। ZIP-এ পাওয়া hard-coded test key-ও নিরাপত্তার জন্য বাদ দেওয়া হয়েছে।

## 3) Public HTTPS tunnel চালু করো

NanoBananaAPI সরাসরি তোমার PC-র `localhost` খুলতে পারে না; composite catalog image আর face photo আনার জন্য temporary HTTPS image URL দরকার। [Cloudflare Quick Tunnel docs](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) দেখো। `cloudflared` install থাকলে backend port 5000-এ tunnel চালাও:

```powershell
cloudflared tunnel --url http://localhost:5000
```

Terminal-এ একটি `https://....trycloudflare.com` URL দেখাবে। সেটি `NANOBANANA_PUBLIC_BASE_URL`-এ বসাও। Tunnel-টি খোলা রেখো। URL বদলে গেলে `.env` আপডেট করে backend restart করতে হবে।

`NANOBANANA_TUNNEL_RESTRICT_MODE=true` থাকলে public tunnel দিয়ে শুধু health check, expiring image URL এবং provider callback accessible হবে; profiles/history API tunnel দিয়ে block থাকবে। Local frontend-এর localhost requests কাজ করবে।

## 4) Dependencies install ও app চালাও

**Backend terminal:**

```powershell
cd "PATH-TO-EXTRACTED-PROJECT\server"
npm install
npm run dev
```

**Frontend terminal:**

```powershell
cd "PATH-TO-EXTRACTED-PROJECT\client"
npm install
npm run dev
```

Browser-এ Vite terminal-এ দেখানো `Local:` URL খোলো (সাধারণত `http://localhost:5173`). Generation-এর সময় backend, frontend ও tunnel—তিনটিই চালু থাকতে হবে।

## 5) কীভাবে যাচাই করবে

`http://localhost:5000/api/health` খুলে `nanoBananaConfigured: true` এবং `nanoBananaPublicBaseConfigured: true` দেখো। তারপর catalog-এ চারটি product দিয়ে Try On চালাও। API key/credits, provider availability এবং grid alignment এখনও real account দিয়ে test করতে হবে; code check-কে actual generation success ধরে নিও না।

## Privacy reminder

এই workflow-তে user face photo এবং composite catalog image NanoBananaAPI-র কাছে যায়। Backend temporary URL random token দিয়ে তৈরি করে এবং task শেষ হলে বা সর্বোচ্চ ১০ মিনিটের মধ্যে মুছে দেয়। Public HTTPS tunnel শুধু এই generation-এর সময় চালু রাখো; `.env` কখনো share/commit কোরো না।
