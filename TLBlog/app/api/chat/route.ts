// app/api/chat/route.ts
import { siteConfig } from '../../../siteConfig';
import { allow, clientIp, deny, isSameOrigin } from '../../../lib/apiGuard';

/**
 * 🐾 AI 煤球的对话接口。
 *
 * 🛡️ 这个接口是「用服务器上的 AI Key 去调模型」，原先**谁都能打**：
 *    没认证、没限流、没来源校验 —— 别人写个脚本就能拿你的额度刷。
 *    现在有：① 同源校验 ② 长度上限 ③ 进程内限流（兜底）
 *    真正的限流在 nginx 那层（limit_req，所有 worker 共享），见 deploy/linux/nginx-tlblog.conf
 *
 * 🔌 支持两类模型后端，**优先用 OpenAI 兼容那套**：
 *
 *    ① OpenAI 兼容（国内主流，推荐）—— 环境变量：
 *         AI_API_KEY    必填，模型平台的 key
 *         AI_BASE_URL   选填，默认 https://open.bigmodel.cn/api/paas/v4（智谱）
 *         AI_MODEL      选填，默认 glm-4-flash（智谱的免费模型）
 *       通义千问：https://dashscope.aliyuncs.com/compatible-mode/v1 （模型 qwen-flash）
 *       DeepSeek：https://api.deepseek.com                        （模型 deepseek-chat）
 *       Kimi    ：https://api.moonshot.cn/v1                      （模型 moonshot-v1-8k）
 *
 *    ② Google Gemini —— 环境变量 GEMINI_API_KEY（或 OPENAI_API_KEY）
 *       ⚠️ 仅当上面那套没配时才用。**国内服务器基本连不上 Google**，
 *          所以这条路在国内机房等于不可用，保留只是为了将来有代理时能用。
 *
 * ⚠️⚠️ 运行时是 **nodejs**，不要改成 edge：
 *    edge 的 `process.env.X` 是**构建期内联**的 —— 换个 key 就得重新构建整个站点；
 *    nodejs 是**运行期**读环境变量（Next 启动时会加载 `.env.local`）——
 *    改 key 只要 `systemctl restart tlblog`，不用重建。
 *    （2026-10-06 踩过坑：当时服务器上没有任何 key 可取，改成 nodejs 就哑了；
 *      现在改成读 `.env.local`，这条路才真正走得通。）
 */

export const runtime = 'nodejs';

const MAX_MESSAGE_CHARS = 2000;

const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'glm-4-flash';
const AI_API_KEY = (
  process.env.AI_API_KEY ||
  process.env.GLM_API_KEY ||
  process.env.ZHIPU_API_KEY ||
  ''
).trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '').trim();

/** 把 siteConfig 里那套「煤球性格」转成参数（控制台「AI 煤球配置」改的就是它） */
function catParams() {
  const c = siteConfig.geminiConfig;
  return {
    systemPrompt: c?.systemPrompt || '你是一只傲娇可爱的暹罗猫，说话简短，句尾带“喵~”。',
    maxTokens: c?.maxOutputTokens || 150,
    temperature: c?.temperature ?? 0.85,
  };
}

export async function POST(req: Request) {
  // ① 同源校验
  if (!isSameOrigin(req)) {
    return deny('这个接口只给本站页面用', 403);
  }

  // ② 限流（nginx 那层之外的兜底；nodejs 下内存计数是可靠的）
  const ip = clientIp(req);
  if (!allow('chat', ip, { max: 40, windowMs: 10 * 60 * 1000, minIntervalMs: 2000 })) {
    return deny('问得太快啦，歇一会儿再聊喵～', 429);
  }

  try {
    const { message } = await req.json();

    // ③ 长度上限
    if (typeof message !== 'string' || !message.trim()) {
      return deny('消息不能为空', 400);
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return deny('这条消息太长了，短一点再问喵～', 413);
    }

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
        // ⚠️ 细节只写日志，不回给前端 —— 别把 key 失效之类的内部信息透给访客
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

    // ── ② Google Gemini（国内服务器基本连不上，仅作保留）──
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

    // ── 两个都没配 ──
    // ⚠️ 这里以前会把 key 的状态直接抛给前端，结果访客会在猫的对话框里看到 "Key missing"。
    //    现在细节只写日志，前端只会说兜底台词。
    console.error('❌ [chat] 没有配置任何模型 key（AI_API_KEY / GEMINI_API_KEY 都是空的）');
    return deny('本喵现在有点迷糊，等会儿再聊喵～', 503);
  } catch (error: any) {
    console.error('🔥 [chat] 运行时异常:', error?.message);
    return deny('本喵卡壳了喵…', 500);
  }
}

/** 只读状态查询，零敏感信息（只报"配没配"，不报任何 key 内容）。 */
export async function GET() {
  return Response.json({
    status: 'Ready',
    provider: AI_API_KEY ? `openai-compatible:${AI_MODEL}` : GEMINI_API_KEY ? 'gemini' : 'none',
  });
}
