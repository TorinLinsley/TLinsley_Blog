/**
 * 🔔 新评论通知（可选功能，一条环境变量就能开）。
 *
 * 为什么不用 GitHub 的邮件通知：评论是**用站点主人的 Token 代发**的，
 * 而 GitHub **不会把你自己账号的操作通知给你**（自己发的评论不给你发邮件）。
 * 所以这里直接给你推一条，手机比邮件还快。
 *
 * 支持四种，配哪个用哪个（都没配就静默跳过，不影响访客提交）：
 *   COMMENTS_NOTIFY_WEBHOOK     通用 webhook（POST JSON，企业微信/钉钉/自建都行）
 *   COMMENTS_NOTIFY_SERVERCHAN  Server酱 SendKey（微信推送）
 *   COMMENTS_NOTIFY_BARK        Bark 的 URL（iOS 推送）
 *   COMMENTS_NOTIFY_TELEGRAM    "bot_token:chat_id"（Telegram）
 *
 * ⚠️ 全部 fire-and-forget：通知失败绝不能让访客的评论提交失败。
 */

export type NotifyPayload = {
  page: string;
  name: string;
  content: string;
  time: string;
};

function title(p: NotifyPayload): string {
  return `💬 新评论 · ${p.name}`;
}

function body(p: NotifyPayload): string {
  return `${p.content}\n\n—— 来自 ${p.page}\n${p.time}`;
}

async function post(url: string, data: unknown, headers: Record<string, string> = {}) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

async function sendWebhook(p: NotifyPayload, url: string) {
  // 同时带上 text 和 markdown，兼容企业微信/钉钉/自定义机器人
  const text = `${title(p)}\n${body(p)}`;
  await post(url, { msgtype: 'text', text: { content: text }, content: text, title: title(p), body: body(p) });
}

async function sendServerChan(p: NotifyPayload, key: string) {
  const url = key.startsWith('sctp')
    ? `https://${key.split('.')[0]}.push.ft07.com/send/${key}.send`
    : `https://sctapi.ftqq.com/${key}.send`;
  await post(url, { title: title(p), desp: body(p) });
}

async function sendBark(p: NotifyPayload, base: string) {
  const url = base.replace(/\/+$/, '') + '/' + encodeURIComponent(title(p)) + '/' + encodeURIComponent(p.content);
  await fetch(url);
}

async function sendTelegram(p: NotifyPayload, conf: string) {
  const [token, chatId] = conf.split(':');
  if (!token || !chatId) return;
  await post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text: `${title(p)}\n${body(p)}` });
}

/** 有配就推，没配就跳过；任何异常都吞掉 */
export async function notifyNewComment(p: NotifyPayload): Promise<void> {
  // 配置来自 data/comments-config.json（控制台里填的）+ 环境变量覆盖
  const { merged, readCommentsConfig } = await import('./commentsConfig');
  const c = merged(await readCommentsConfig());

  const tasks: Promise<void>[] = [];
  if (c.notifyWebhook) tasks.push(sendWebhook(p, c.notifyWebhook));
  if (c.notifyServerChan) tasks.push(sendServerChan(p, c.notifyServerChan));
  if (c.notifyBark) tasks.push(sendBark(p, c.notifyBark));
  if (c.notifyTelegram) tasks.push(sendTelegram(p, c.notifyTelegram));

  await Promise.allSettled(tasks);
}
