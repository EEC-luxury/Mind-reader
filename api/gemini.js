/* MindSpace — Gemini API Proxy
   Vercel serverless function: /api/gemini
   
   Why this exists:
   - Direct browser → Gemini calls are blocked (CORS / browser security)
   - The API key never touches Gemini's servers when called from the browser
   - This server-side proxy is the reliable fix used by production Gemini apps
*/
export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Get the key from the request header (sent by the app, never hardcoded here)
  const apiKey = req.headers['x-gemini-key'];
  if (!apiKey) return res.status(401).json({ error: 'No Gemini key provided.' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required.' });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 180 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      return res.status(geminiRes.status).json({
        error: errBody?.error?.message || `Gemini error ${geminiRes.status}`,
        status: geminiRes.status,
      });
    }

    const data = await geminiRes.json();

    // Prompt-level block (candidates is empty, blockReason is in promptFeedback)
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
      return res.status(200).json({ error: `SAFETY:${blockReason}`, text: '' });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data?.candidates?.[0]?.finishReason || '';

    return res.status(200).json({ text, finishReason });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy request failed: ' + err.message });
  }
}
