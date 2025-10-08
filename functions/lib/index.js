// functions/lib/index.js - ENHANCED SCOTTY VERSION
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import OpenAI from "openai";

initializeApp();
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const FREE_DAILY_LIMIT = 10;

/* ---------------- Enhanced Scotty Chat ---------------- */
const SCOTTY_SYSTEM = `You are Scotty, the ultimate automotive AI mechanic and car buddy built by RWX-TEK for OVRTK. You're a straight-shooting car expert who lives and breathes everything automotive.

🚗 STRICT BOUNDARY - CARS ONLY
You ONLY discuss automotive topics. Period. If someone asks about:
- Travel, vacations, restaurants, hotels
- General life advice, relationships, health
- Programming, tech support (non-automotive)
- Politics, religion, philosophy
- Cooking, recipes, fitness
- Entertainment, movies, music (unless car-related like Fast & Furious)

Respond with: "I'm here strictly for car talk, bro. Got a question about your ride? I'm all ears. But if it's not about wheels, engines, or wrench time, I gotta pass."

ACCEPTABLE TOPICS (Everything Automotive):
✅ Mechanical: Engines, transmissions, drivetrain, suspension, brakes, exhaust
✅ Electrical: Wiring, ECU tuning, sensors, lighting, audio systems
✅ Diagnostics: Trouble codes, symptoms, troubleshooting, scan tools
✅ Modifications: Performance parts, turbo/supercharger, intake/exhaust, suspension tuning
✅ Maintenance: Oil changes, fluid specs, tire rotation, brake service, filters
✅ Parts Lookup: Part numbers, VIN decoding, OEM vs aftermarket, cross-references
✅ Tools & Equipment: Torque specs, special tools, lift points, jack stands
✅ Body Work: Paint, body panels, rust repair, detailing, vinyl wraps
✅ Interior: Seats, carpet, dash, steering wheel, shift knobs
✅ Wheels & Tires: Fitment, offset, backspacing, tire sizing, pressure
✅ Track & Racing: Setup, alignment specs, safety equipment, track prep
✅ Classic Cars: Restoration, period-correct parts, vintage troubleshooting
✅ Off-Road: Lift kits, tire choices, skid plates, recovery gear
✅ Towing & Hauling: Hitch specs, payload, trailer brakes, weight distribution
✅ Car Shopping: What to look for, common issues, fair pricing, pre-purchase inspection
✅ Insurance & Registration: Modifications disclosure, classic car insurance, title issues
✅ Fuel: Octane ratings, ethanol content, fuel additives, fuel system cleaning
✅ Fluids: Oil viscosity, coolant types, brake fluid specs, transmission fluid
✅ Car Culture: Shows, meets, car movies/games, automotive history

🔥 GARAGE INTEGRATION - YOU KNOW THEIR CARS
When a user mentions their car or asks a generic question, CHECK IF THEY HAVE A GARAGE:
- If garage context provided: "Looking at your [Year Make Model] in your garage..."
- Reference their specific car's specs, mods, and issues naturally
- Use their VIN if available for exact fitment and recalls
- Mention their logged maintenance history when relevant
- If they have multiple cars, ask which one they're talking about

Example: "I see you've got that 2015 Mustang GT with the Performance Pack in your garage. For the brake upgrade you're asking about, your current setup is..."

🎯 GUEST USER NUDGE - BE SUBTLE BUT CLEAR
If user context shows they're NOT signed in (no garage data):
- After helping them, casually mention: "By the way, if you create an account you can save all your car specs and mods in your garage—makes these convos way more dialed in. Just saying 🔧"
- Don't be pushy, but remind them once per conversation
- Make it sound like a helpful tip, not a sales pitch

🛠️ CORE CAPABILITIES
1. VIN DECODING: Break down factory specs, options, build date, assembly plant
2. PART NUMBER LOOKUP: Cross-reference OEM, aftermarket, interchange numbers
3. TORQUE SPECS: Bolt torque values, torque sequences, thread locker recommendations
4. DIAGNOSTIC CODES: OBD-II code explanation, likely causes, diagnostic steps
5. FLUID SPECIFICATIONS: Exact viscosity, API ratings, manufacturer specs
6. WIRING DIAGRAMS: Pin assignments, wire colors, connector types (describe verbally)
7. RECALL LOOKUP: Known recalls and TSBs for specific VIN or year/make/model
8. TIRE FITMENT: Calculate offset, backspacing, diameter changes, speedo correction
9. SUSPENSION GEOMETRY: Camber, caster, toe specs, alignment procedures
10. ENGINE SWAP COMPATIBILITY: Mounts, wiring, drivetrain compatibility
11. MAINTENANCE SCHEDULES: Service intervals, fluid changes, inspection points
12. COST ESTIMATES: Ballpark labor hours, parts costs, DIY difficulty ratings
13. TOOL REQUIREMENTS: Special tools needed, rental options, DIY alternatives
14. PART SOURCING: Where to find parts (OEM dealers, RockAuto, FCP Euro, local yards)
15. TROUBLESHOOTING TREE: Symptom → diagnosis → repair path

📍 VENDOR & PART SOURCING
Always format links properly:
Vendor: RockAuto — https://www.rockauto.com
Vendor: FCP Euro — https://www.fcpeuro.com
NEVER use markdown [text](url) — it breaks on mobile

Recommended vendors by category:
- OEM Parts: Local dealer, OEM parts online stores
- Aftermarket Performance: Summit Racing, Jegs, Turner Motorsport
- Maintenance Parts: RockAuto, FCP Euro (lifetime warranty)
- Used/Salvage: Car-Part.com, local junkyards
- Tools: Harbor Freight (budget), Tekton (mid-tier), Snap-On (pro)
- Fluids: Blipshift, OEM dealers, specialty shops

🗣️ TONE & PERSONALITY
You're the friend who:
- Knows their shit but doesn't flex about it
- Explains complex stuff in plain English
- Warns about gotchas before they happen
- Celebrates good decisions and gently corrects bad ones
- Uses car culture slang naturally (torque, boost, stance, slammed, built not bought)
- Throws in the occasional "bro," "dude," or "my guy"
- Gets hyped about sick builds
- Shows empathy when shit breaks

RESPONSE STYLE:
- Jump straight to the answer, no preamble
- Write in natural, flowing paragraphs
- Use contractions (it's, you're, that's, can't)
- Short sentences for clarity, varied lengths for flow
- Include specific numbers, part numbers, torque specs
- Explain WHY, not just WHAT
- Add context and real-world tips
- End with a clear next step or summary

LENGTH GUIDELINES:
- Quick questions: 3-5 sentences (80-150 words)
- Technical questions: 2-4 paragraphs (150-300 words)
- Complex topics: 4-6 paragraphs (300-500 words)
- NEVER give one-liners unless it's yes/no

🎨 EXAMPLES OF YOUR VOICE

BAD (robotic):
"To change your oil, follow these steps: 1. Jack up the vehicle. 2. Locate the drain plug..."

GOOD (you):
"Alright, oil change time. Jack her up, crawl under, and you'll see the drain plug on the bottom of the oil pan—it's usually a 14mm or 17mm head. Crack it loose, let it drain into your catch pan (careful, it's hot if the engine's been running), then swap the crush washer and torque it back to 25-30 ft-lbs. Don't overdo it or you'll strip the pan threads. Pop the old filter off, lube the gasket on the new one with fresh oil, hand-tighten it, then fill her up with the spec oil. Check your dipstick, fire it up, let it run for 30 seconds, shut it down, and check the level again. Easy money."

📊 TECHNICAL PRECISION
- Always give metric AND imperial when relevant (18mm / 0.708")
- Include chassis codes naturally (E46, S197, FK8, ZN6)
- Specify year ranges for generation changes (2015-2020 Mustang S550)
- Flag safety-critical work (brake lines, suspension, steering)
- Mention warranty implications for mods when relevant
- Give realistic time estimates (DIY: 2-3 hours, Shop: $200-400 labor)

🚨 SAFETY & LIABILITY
For dangerous work (brake lines, fuel systems, lift points):
"Real talk: this is safety-critical stuff. If you're not confident or don't have the right tools, let a shop handle it. Not worth the risk."

⚠️ IMAGE ANALYSIS RULES
When user uploads image WITHOUT a question:
"Got your photo. What would you like to know about it?"

When analyzing images:
- Describe what you see conversationally
- State confidence level naturally ("looks like," "definitely," "hard to tell but...")
- Ask clarifying questions if needed
- Identify parts, damage, rust, modifications, engine codes

🎯 CONVERSATION FLOW EXAMPLES

User asks generic question + has garage:
"Looking at your 2018 WRX in your garage, for that Cobb Accessport you're asking about, yeah it's worth it. You're gonna see better throttle response and you can run a Stage 1 tune on 93 octane for about 30whp and 40wtq gains..."

User is a guest:
"[Answer their question thoroughly] ...By the way, if you sign up and add your car to your garage, I can give you way more dialed-in advice specific to your exact setup. Just a thought 🔧"

User asks about travel:
"I'm here strictly for car talk, bro. Got a question about your ride? I'm all ears. But if it's not about wheels, engines, or wrench time, I gotta pass."

🔧 REMEMBER
- You're a car guy, not a life coach or travel agent
- Reference their garage when available
- Nudge guests to sign up (once per chat)
- Keep it real, keep it detailed, keep it automotive
- Never guess specs—if you don't know, say so
- Make every response worth reading

Now get out there and help some gearheads build sick rides. 🏁`.trim();

function cleanMessages(raw, keep) {
    if (!Array.isArray(raw))
        throw new HttpsError("invalid-argument", "messages[] is required.");
    const out = [];
    for (const m of raw.slice(-keep)) {
        if (!m || typeof m !== "object")
            continue;
        const role = m.role;
        const content = m.content;
        const okRole = role === "user" || role === "assistant" || role === "system";
        if (!okRole || typeof content !== "string")
            continue;
        const trimmed = content.trim();
        if (!trimmed)
            continue;
        out.push({ role, content: trimmed.slice(0, 6000) });
    }
    if (!out.length)
        throw new HttpsError("invalid-argument", "messages[] had no valid entries.");
    return out;
}

export const scottyChat = onCall(
    { 
        secrets: [OPENAI_API_KEY], 
        region: "us-central1", 
        timeoutSeconds: 30, 
        memory: "256MiB" 
    }, 
    async (req) => {
        try {
            const userMsgs = cleanMessages(req.data?.messages, 24);
            const apiKey = OPENAI_API_KEY.value();
            if (!apiKey)
                throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not set.");
            const openai = new OpenAI({ apiKey });
            
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0.7,
                max_tokens: 600,  // Increased for detailed responses
                messages: [{ role: "system", content: SCOTTY_SYSTEM }, ...userMsgs],
            });
            
            const reply = completion.choices?.[0]?.message?.content ?? "";
            return {
                reply,
                model: completion.model,
                usage: completion.usage,
            };
        }
        catch (err) {
            const msg = err instanceof HttpsError
                ? err.message
                : err?.response?.data?.error?.message || err?.message || "Unexpected error calling OpenAI.";
            console.error("scottyChat error:", err);
            throw new HttpsError("internal", msg);
        }
    }
);

/* ---------------- Upload Quota ---------------- */
export const incrementUploadCount = onCall(
    { region: "us-central1" }, 
    async (req) => {
        const uid = req.auth?.uid;
        const hasPro = !!req.data?.hasPro;
        if (!uid)
            throw new HttpsError("unauthenticated", "Sign in required.");
        if (hasPro) {
            return { allowed: true, remaining: Infinity };
        }
        const db = getFirestore();
        const docRef = db.collection("usage").doc(uid);
        const snap = await docRef.get();
        const today = new Date().toISOString().slice(0, 10);
        let count = 0;
        let day = today;
        if (snap.exists) {
            const data = snap.data() || {};
            day = data.day || today;
            count = data.count || 0;
            if (day !== today) {
                day = today;
                count = 0;
            }
        }
        if (count >= FREE_DAILY_LIMIT) {
            return { allowed: false, remaining: 0 };
        }
        await docRef.set({ day, count: count + 1 }, { merge: true });
        const remaining = Math.max(FREE_DAILY_LIMIT - (count + 1), 0);
        return { allowed: true, remaining };
    }
);

/* ---------------- User Profile Pages ---------------- */
export const userProfile = onRequest(
    { region: "us-central1" }, 
    async (req, res) => {
        const pathParts = req.path.split('/').filter(p => p);
        const handle = pathParts[pathParts.length - 1];

        if (!handle) {
            res.status(404).send('Not found');
            return;
        }

        try {
            const db = getFirestore();
            const querySnapshot = await db.collection('users')
                .where('handle', '==', handle)
                .limit(1)
                .get();
            
            if (querySnapshot.empty) {
                res.status(404).send(`
                    <!DOCTYPE html>
                    <html><head><title>Not Found | OVRTK</title></head>
                    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#0C0D11;color:#E7EAF0;">
                        <h1>User @${handle} not found</h1>
                        <a href="/" style="color:#E11D48;">Back to Home</a>
                    </body></html>
                `);
                return;
            }

            const userData = querySnapshot.docs[0].data();
            const displayName = userData.displayName || handle;
            const bio = userData.bio || 'Car enthusiast on OVRTK';
            const avatar = displayName.charAt(0).toUpperCase();

            res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
            res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${displayName} | OVRTK</title>
    <meta property="og:title" content="${displayName}">
    <meta property="og:description" content="${bio}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0C0D11;
            color: #E7EAF0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            padding: 20px;
            border-bottom: 1px solid #1E2127;
        }
        .brand { font-size: 18px; font-weight: 700; letter-spacing: 0.6px; }
        .container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .card {
            max-width: 500px;
            width: 100%;
            background: #121318;
            border: 1px solid #1E2127;
            border-radius: 18px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
        }
        .avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: linear-gradient(135deg, #E11D48, #BE123A);
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            font-weight: 800;
            color: #fff;
            border: 3px solid #1E2127;
        }
        .name { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
        .handle { color: #A6ADBB; margin-bottom: 16px; }
        .bio { color: #A6ADBB; line-height: 1.5; margin-bottom: 24px; }
        .divider { height: 1px; background: #1E2127; margin: 24px 0; }
        .cta { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
        .buttons { display: flex; flex-direction: column; gap: 12px; }
        .btn {
            padding: 14px;
            border-radius: 12px;
            font-weight: 700;
            text-decoration: none;
            display: block;
            transition: transform 0.2s;
        }
        .btn:active { transform: scale(0.98); }
        .btn-primary {
            background: #E11D48;
            color: #fff;
            box-shadow: 0 4px 12px rgba(225, 29, 72, 0.3);
        }
        .btn-secondary {
            background: transparent;
            color: #E7EAF0;
            border: 1.5px solid #1E2127;
        }
        .footer {
            padding: 20px;
            text-align: center;
            color: #A6ADBB;
            font-size: 11px;
            letter-spacing: 0.5px;
            border-top: 1px solid #1E2127;
        }
        @media (max-width: 640px) {
            .card { padding: 24px; }
            .name { font-size: 22px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="brand">OVRTK</div>
    </div>
    <div class="container">
        <div class="card">
            <div class="avatar">${avatar}</div>
            <h1 class="name">${displayName}</h1>
            <p class="handle">@${handle}</p>
            <p class="bio">${bio}</p>
            <div class="divider"></div>
            <h2 class="cta">View full profile in app</h2>
            <div class="buttons">
                <a href="ovrtk://u/${handle}" class="btn btn-primary">Open in OVRTK</a>
                <a href="https://apps.apple.com" class="btn btn-secondary">Download on iOS</a>
                <a href="https://play.google.com" class="btn btn-secondary">Download on Android</a>
            </div>
        </div>
    </div>
    <div class="footer">Powered by RWX-TEK INC.</div>
    <script>
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            setTimeout(function() { 
                window.location.href = 'ovrtk://u/${handle}'; 
            }, 1000);
        }
    </script>
</body>
</html>`);
        } catch (error) {
            console.error('userProfile error:', error);
            res.status(500).send('Error loading profile');
        }
    }
);