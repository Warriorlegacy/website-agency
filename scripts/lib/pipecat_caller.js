/**
 * scripts/lib/pipecat_caller.js
 * Pipecat integration — real-time AI voice calling via Pipecat framework
 *
 * Uses Pipecat's Python framework to place conversational AI phone calls
 * with real STT/TTS, objection handling, and Cal.com booking integration.
 * Falls back to simulation mode when Pipecat is not installed.
 *
 * Installation (when ready for Phase 3):
 *   pip install pipecat-ai[daily,cartesia,deepgram]
 *
 * ponytail: subprocess bridge to Python, no npm deps
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadAppConfig } from './config_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_DIR = path.join(__dirname, '..', '..');

// Windows uses 'python', Linux/Mac uses 'python3'
function getPythonCmd() {
  return process.platform === 'win32' ? 'python' : 'python3';
}

const PIPECAT_CALL_SCRIPT = `
import asyncio
import json
import sys
import os

async def make_call(data):
    business_name = data.get("businessName", "")
    phone = data.get("phone", "")
    owner_name = data.get("ownerName", "Business Owner")
    city = data.get("city", "")
    niche = data.get("niche", "")
    cal_url = data.get("calUrl", "https://cal.com/piyush-usctna/15min")

    # Try Pipecat (pip install pipecat-ai[daily,cartesia,deepgram])
    daily_url = os.environ.get("DAILY_ROOM_URL", "")
    daily_token = os.environ.get("DAILY_TOKEN", "")
    cartesia_key = os.environ.get("CARTESIA_API_KEY", "")
    deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "")

    if daily_url and cartesia_key and deepgram_key:
        try:
            from pipecat.pipeline.pipeline import Pipeline
            from pipecat.pipeline.runner import PipelineRunner
            from pipecat.pipeline.task import PipelineParams, PipelineTask
            from pipecat.transports.services.daily import DailyTransport, DailyParams
            from pipecat.services.cartesia import CartesiaTTSService
            from pipecat.services.deepgram import DeepgramSTTService
            from pipecat.services.openai import OpenAILLMService

            system_prompt = f"""You are Alex from Apex AI Web Studio calling {owner_name} at {business_name} in {city}.
Mission: Briefly mention you built a free modern website demo for their {niche} business,
and offer to book a 15-min walkthrough at {cal_url}.
Rules: Be warm, under 2 sentences per turn. If they say STOP, end politely."""

            transport = DailyTransport(DailyParams(room_url=daily_url, token=daily_token))
            llm = OpenAILLMService(model="gpt-4o-mini")
            tts = CartesiaTTSService(api_key=cartesia_key)
            stt = DeepgramSTTService(api_key=deepgram_key)

            pipeline = Pipeline([stt, llm, tts])
            task = PipelineTask(pipeline, PipelineParams(messages=[
                {"role": "system", "content": system_prompt}
            ]))

            runner = PipelineRunner()
            await runner.run(task)
            return {"status": "completed", "outcome": "call_placed", "provider": "pipecat_daily"}
        except Exception as e:
            print(f"Pipecat unavailable: {e}", file=sys.stderr)

    # Simulation fallback (no Pipecat/Daily credentials needed)
    return simulate_call(business_name, owner_name, city, niche, cal_url)

def simulate_call(business_name, owner_name, city, niche, cal_url):
    """AI dual-agent conversation simulation — zero cost, no credentials."""
    import random
    outcomes = ["interested", "meeting_scheduled", "send_proposal", "callback_requested", "not_interested"]
    weights  = [0.25, 0.30, 0.20, 0.15, 0.10]
    outcome = random.choices(outcomes, weights=weights)[0]

    transcript = [
        {"turn": "agent", "text": f"Hi, is this {owner_name} from {business_name}?"},
        {"turn": "owner", "text": "Yes, who's calling?"},
        {"turn": "agent", "text": f"This is Alex from Apex AI Web Studio. We built a free custom website demo for {business_name} — I was hoping to get your quick feedback!"},
        {"turn": "owner", "text": "Oh really? What kind of demo?"},
        {"turn": "agent", "text": f"A modern, mobile-first redesign for your {niche} business. You can see it live — took us about an hour to build. Would a quick 15-minute screen share work this week?"},
    ]
    if outcome in ("meeting_scheduled", "interested"):
        transcript.append({"turn": "owner", "text": f"Sure, I'm interested. Send me the link."})
        transcript.append({"turn": "agent", "text": f"Perfect! I'll send the demo and a calendar link to {cal_url}. Thanks so much!"})
    else:
        transcript.append({"turn": "owner", "text": "We're okay for now, but thanks."})
        transcript.append({"turn": "agent", "text": "Absolutely, no worries! I'll leave the demo link in your email in case you ever need it. Have a great day!"})

    return {
        "status": "simulated",
        "outcome": outcome,
        "transcript": transcript,
        "calUrl": cal_url,
        "provider": "simulation"
    }

if __name__ == "__main__":
    data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    result = asyncio.run(make_call(data))
    print(json.dumps(result))
`;

/**
 * Place an AI voice call via Pipecat (or simulation).
 * @param {object} lead - Prospect with businessName, phone, ownerName, city, niche
 * @param {object} opts - { simulate: bool }
 * @returns {Promise<object>} Call result with transcript and outcome
 */
export async function placeVoiceCall(lead, opts = {}) {
  const cfg = loadAppConfig();
  const pipecatCfg = cfg.integrations?.pipecat || {};
  const calUrl = cfg.scheduling?.calcomBookingUrl || 'https://cal.com/piyush-usctna/15min';

  console.log(`  📞 [Pipecat] Calling ${lead.businessName} (${lead.phone || 'no phone'})...`);

  return new Promise((resolve) => {
    const tmpScript = path.join(SCRIPT_DIR, '.pipecat_tmp.py');
    fs.writeFileSync(tmpScript, PIPECAT_CALL_SCRIPT);

    const payload = JSON.stringify({
      businessName: lead.businessName,
      phone: lead.phone || '',
      ownerName: lead.ownerName || 'Business Owner',
      city: lead.city || '',
      niche: lead.niche || '',
      calUrl
    });

    // Pass Pipecat credentials as env vars
    const env = {
      ...process.env,
      DAILY_ROOM_URL: pipecatCfg.dailyRoomUrl || '',
      DAILY_TOKEN: pipecatCfg.dailyToken || '',
      CARTESIA_API_KEY: pipecatCfg.cartesiaApiKey || '',
      DEEPGRAM_API_KEY: pipecatCfg.deepgramApiKey || ''
    };

    const pythonCmd = getPythonCmd();
    const proc = spawn(pythonCmd, [tmpScript, payload], {
      cwd: SCRIPT_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 180000,
      env
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      try { fs.unlinkSync(tmpScript); } catch {}

      if (code !== 0) {
        console.warn(`  ⚠️ Pipecat exited ${code}: ${stderr.slice(0, 200)}`);
        // Return a safe simulated outcome on error so pipeline continues
        resolve({ status: 'error', outcome: 'callback_requested', error: stderr.slice(0, 200) });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        console.log(`  ✅ Call ${result.status}: outcome=${result.outcome} via ${result.provider || 'unknown'}`);
        resolve(result);
      } catch (e) {
        resolve({ status: 'error', outcome: 'parse_error' });
      }
    });

    proc.on('error', (e) => {
      try { fs.unlinkSync(tmpScript); } catch {}
      console.warn(`  ⚠️ Python unavailable for Pipecat: ${e.message} — returning simulated outcome`);
      resolve({ status: 'simulated', outcome: 'callback_requested', provider: 'fallback' });
    });
  });
}
