import { siteConfig } from '../../../siteConfig';
import { allow, clientIp, deny, isSameOrigin } from '../../../lib/apiGuard';


export const runtime = 'nodejs';

const MAX_MESSAGE_CHARS = 2000;

const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'glm-4-flash-250414';
const AI_API_KEY = (
  process.env.AI_API_KEY ||
  process.env.GLM_API_KEY ||
  process.env.ZHIPU_API_KEY ||
  ''
).trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '').trim();

function catParams() {
  const c = siteConfig.geminiConfig;
  return {
    systemPrompt: c?.systemPrompt || '你是一只傲娇可爱的暹罗猫，说话简短，句尾带“喵~”。',
    maxTokens: c?.maxOutputTokens || 150,
    temperature: c?.temperature ?? 0.85,
  };
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return deny('这个接口只给本站页面用', 403);
  }

  const ip = clientIp(req);
  if (!allow('chat', ip, { max: 40, windowMs: 10 * 60 * 1000, minIntervalMs: 2000 })) {
    return deny('问得太快啦，歇一会儿再聊喵～', 429);
  }

  try {
    const { message } = await req.json();

    if (typeof message !== 'string' || !message.trim()) {
      return deny('消息不能为空', 400);
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return deny('这条消息太长了，短一点再问喵～', 413);
    }

    const { systemPrompt, maxTokens, temperature } = catParams();

    if (AI_API_KEY) {
      console.log(`📡 [chat] OpenAI 兼容: ${AI_BASE_URL}  模型 ${AI_MODEL}`);
      const upstream = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
      });

      const data: any = await upstream.json().catch(() => null);

      if (!upstream.ok) {
        console.error('🚨 [chat] 模型服务拒绝:', upstream.status, JSON.stringify(data)?.slice(0, 300));
        return deny('本喵的脑子暂时连不上，等会儿再聊喵～', 502);
      }

      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        console.error('🚨 [chat] 返回里没有内容:', JSON.stringify(data)?.slice(0, 300));
        return deny('本喵没想出话来，再问一次喵～', 502);
      }

      console.log('✅ [chat] 回复已生成');
      return Response.json({ reply });
    }

    if (GEMINI_API_KEY) {
      console.log('📡 [chat] 走 Gemini（注意：国内机房通常连不上 Google）');
      const modelId = siteConfig.geminiConfig?.modelId || 'gemini-2.5-flash-lite';
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: message }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature },
          }),
        }
      );

      const data: any = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        console.error('🚨 [chat] Gemini 拒绝:', upstream.status, JSON.stringify(data)?.slice(0, 300));
        return deny('本喵的脑子暂时连不上，等会儿再聊喵～', 502);
      }
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '本喵现在不想理你喵...';
      return Response.json({ reply });
    }

    console.error('❌ [chat] 没有配置任何模型 key（AI_API_KEY / GEMINI_API_KEY 都是空的）');
    return deny('本喵现在有点迷糊，等会儿再聊喵～', 503);
  } catch (error: any) {
    console.error('🔥 [chat] 运行时异常:', error?.message);
    return deny('本喵卡壳了喵…', 500);
  }
}

export async function GET() {
  return Response.json({
    status: 'Ready',
    provider: AI_API_KEY ? `openai-compatible:${AI_MODEL}` : GEMINI_API_KEY ? 'gemini' : 'none',
  });
}