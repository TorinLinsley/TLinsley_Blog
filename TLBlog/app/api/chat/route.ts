// app/api/chat/route.ts
import { siteConfig } from '../../../siteConfig'; // 确保这里的路径指向你的 siteConfig
import { allow, clientIp, deny, isSameOrigin } from '../../../lib/apiGuard';

/**
 * 🛡️ 这个接口是「用服务器上的 AI Key 去调模型」，原先**谁都能打**：
 *    没认证、没限流、没来源校验 —— 别人写个脚本就能拿你的额度刷。
 *
 * 现在加了三道：
 *   ① 同源校验：只允许本站页面发起的请求（浏览器 POST 必带 Origin）
 *   ② 限流：每个 IP 10 分钟最多 40 次，且两次之间至少隔 2 秒
 *   ③ 长度上限：单条消息最多 2000 字（正常聊天够用，脚本灌水不划算）
 *
 * ⚠️ runtime 从 edge 改成 nodejs：限流要跨请求共享内存计数，
 *    Node 运行时才是确定可靠的（edge 沙箱里的模块状态不保证一致）。
 *    这个路由只用到 fetch / Request / Response，换运行时没有副作用。
 */

export const runtime = 'nodejs';

const MAX_MESSAGE_CHARS = 2000;

export async function POST(req: Request) {
  // ① 同源校验
  if (!isSameOrigin(req)) {
    return deny('这个接口只给本站页面用', 403);
  }

  // ② 限流
  const ip = clientIp(req);
  if (!allow('chat', ip, { max: 40, windowMs: 10 * 60 * 1000, minIntervalMs: 2000 })) {
    return deny('问得太快啦，歇一会儿再聊喵～', 429);
  }

  console.log("🚀 [1/5] 路由进入：开始对接 Gemini 3 脑回路");

  try {
    const { message } = await req.json();

    // ③ 长度上限
    if (typeof message !== 'string' || !message.trim()) {
      return deny('消息不能为空', 400);
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return deny('这条消息太长了，短一点再问喵～', 413);
    }

    // 🌟 纯粹靠环境变量读取 API Key
    const apiKey = (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '').trim();

    if (!apiKey) {
      console.error("❌ 找不到 API Key");
      return new Response(JSON.stringify({ error: "Key missing" }), { status: 500 });
    }

    // 调用 siteConfig 的参数
    const modelId = siteConfig.geminiConfig.modelId;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    console.log(`📡 [2/5] 正在呼叫模型: ${modelId}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: siteConfig.geminiConfig.systemPrompt
          }]
        },
        contents: [{
          parts: [{ text: message }]
        }],
        generationConfig: {
          maxOutputTokens: siteConfig.geminiConfig.maxOutputTokens,
          temperature: siteConfig.geminiConfig.temperature,
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("🚨 Gemini 3 拒绝了请求:", JSON.stringify(data));
      return new Response(JSON.stringify({
        error: `模型拒绝访问: ${response.status}`,
        details: data.error?.message || "未知错误"
      }), { status: response.status });
    }

    console.log("✅ [3/5] Google 成功响应");
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "本喵现在不想理你喵...";

    console.log("🎉 [4/5] 回复已生成，准备传回前端");

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("🔥 [5/5] 运行时崩溃:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

/** 只读的状态查询，零敏感信息，保持公开（方便排查）。 */
export async function GET() {
  return new Response(JSON.stringify({ status: "Ready", model: "Gemini 3 Flash Preview" }), { status: 200 });
}
