// app/api/chat/route.ts
import { siteConfig } from '../../../siteConfig';

/**
 * 🐾 控制台里的 AI 煤球（和前台 TLBlog 那份是同一套逻辑，改一份要同步另一份）。
 *
 * 控制台只监听 127.0.0.1、靠 SSH 隧道访问，公网打不到，
 * 所以这里**不加**同源校验/限流（那是前台那份才需要的）。
 *
 * 🔌 支持两类模型后端，**优先用 OpenAI 兼容那套**（国内直连，不用梯子）：
 *    ① AI_API_KEY / AI_BASE_URL / AI_MODEL
 *       默认智谱：https://open.bigmodel.cn/api/paas/v4 + glm-4-flash（免费）
 *    ② GEMINI_API_KEY（Google，国内机房基本连不上，仅作保留）
 *
 * ⚠️ 运行时是 nodejs：运行期读环境变量（Next 启动时加载 `.env.local`），
 *    换 key 只要重启服务，不用重新构建。
 */

export const runtime = 'nodejs';

const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'glm-4-flash';
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
  try {
    const { message } = await req.json();
    const { systemPrompt, maxTokens, temperature } = catParams();

    // ── ① OpenAI 兼容（智谱 / 通义 / DeepSeek / Kimi…）──
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
        return Response.json({ error: '模型服务暂时不可用' }, { status: 502 });
      }

      const reply = data?.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        console.error('🚨 [chat] 返回里没有内容:', JSON.stringify(data)?.slice(0, 300));
        return Response.json({ error: '模型没有返回内容' }, { status: 502 });
      }

      console.log('✅ [chat] 回复已生成');
      return Response.json({ reply });
    }

    // ── ② Google Gemini（国内机房基本连不上，仅作保留）──
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
        return Response.json({ error: '模型服务暂时不可用' }, { status: 502 });
      }
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '本喵现在不想理你喵...';
      return Response.json({ reply });
    }

    console.error('❌ [chat] 没有配置任何模型 key（AI_API_KEY / GEMINI_API_KEY 都是空的）');
    return Response.json({ error: '没有配置模型 key' }, { status: 503 });
  } catch (error: any) {
    console.error('🔥 [chat] 运行时异常:', error?.message);
    return Response.json({ error: '服务异常' }, { status: 500 });
  }
}

/** 只读状态查询，零敏感信息（只报"配没配"，不报任何 key 内容）。 */
export async function GET() {
  return Response.json({
    status: 'Ready',
    provider: AI_API_KEY ? `openai-compatible:${AI_MODEL}` : GEMINI_API_KEY ? 'gemini' : 'none',
  });
}
